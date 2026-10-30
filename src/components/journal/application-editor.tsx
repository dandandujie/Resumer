'use client';

import { useSettingsStore } from '@/stores/settings-store';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ClipboardList, FileSearch, Loader2, MessagesSquare, MoreHorizontal, PenLine, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logError } from '@/stores/error-log-store';
import { useKnowledgeStore } from '@/stores/knowledge-store';
import { useRouter } from '@/i18n/routing';
import * as api from '@/lib/tauri-api';
import { KnowledgeProposalCard } from '@/components/ai/ai-proposal-card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useJournalStore,
  NO_PROPOSALS,
  APPLICATION_STATUSES,
  CHANNEL_PRESETS,
  INTERVIEW_FORMATS,
  OUTCOME_RESULTS,
  nextInterview,
  type Application,
  type ApplicationStatus,
  type InterviewFormat,
  type InterviewRound,
  type MockInterview,
  type OutcomeResult,
} from '@/stores/journal-store';
import { useEditorStore, type PendingModal } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { useResumeStore } from '@/stores/resume-store';
import { RecordingsPanel } from './recordings-panel';
import { ApplicationAssistant } from './application-assistant';
import { FORMAT_KEY, OUTCOME_KEY, STATUS_KEY, formatUnixSeconds } from './journal-labels';

const NO_RESUME = '__none__';

export interface ResumeOption {
  id: string;
  title: string;
}

interface ApplicationEditorProps {
  app: Application;
  initialRoundId?: string | null;
  /** 可供关联的简历；为空时不显示简历选择器（比如编辑器内只针对当前简历）。 */
  resumes?: ResumeOption[];
  /** 点击删除时回调；确认与实际删除由宿主处理。 */
  onDelete?: () => void;
  /** 触发 AI 动作前的回调（比如求职动态页需要先关掉抽屉）。 */
  onBeforeLaunchTool?: () => void;
}

/**
 * 把投递记录的 JD / 公司 / 岗位交给编辑器里的 AI 对话框。
 * 如果当前就在这份简历的编辑器里，直接打开对话框；否则跳转过去，编辑器挂载后自动打开。
 */
function useLaunchResumeTool(onBefore?: () => void) {
  const router = useRouter();
  const openModal = useUIStore((s) => s.openModal);
  const setToolPrefill = useEditorStore((s) => s.setToolPrefill);
  const setPendingModal = useEditorStore((s) => s.setPendingModal);
  const currentResumeId = useResumeStore((s) => s.currentResume?.id);

  return (app: Application, modal: PendingModal, round?: string) => {
    if (!app.resumeId) return;
    onBefore?.();
    setToolPrefill({
      applicationId: app.id,
      company: app.company,
      role: app.role,
      jd: app.jd,
      round,
    });
    if (currentResumeId === app.resumeId) {
      openModal(modal);
      return;
    }
    setPendingModal(modal);
    router.push(`/editor/${app.resumeId}`);
  };
}

export function ApplicationEditor({ app, resumes, onDelete, onBeforeLaunchTool, initialRoundId }: ApplicationEditorProps) {
  const t = useTranslations('journal');
  const aiConfigured = useSettingsStore(s => Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()));
  const locale = useLocale();
  const update = useJournalStore((s) => s.updateApplication);
  const addInterview = useJournalStore((s) => s.addInterview);
  const updateInterview = useJournalStore((s) => s.updateInterview);
  const removeInterview = useJournalStore((s) => s.removeInterview);
  const setOutcome = useJournalStore((s) => s.setOutcome);
  const removeMock = useJournalStore((s) => s.removeMock);
  const mocks = useJournalStore((s) => s.mocks);
  const reflection = useJournalStore((s) => s.reflections[app.id]);
  const proposals = useJournalStore((s) => s.knowledgeProposals[app.id] ?? NO_PROPOSALS);
  const resolveKnowledgeProposal = useJournalStore((s) => s.resolveKnowledgeProposal);
  const reflectApplication = useJournalStore((s) => s.reflectApplication);
  const launch = useLaunchResumeTool(onBeforeLaunchTool);
  const tVersion = useTranslations('versionHistory');
  const setPendingVersionId = useEditorStore((s) => s.setPendingVersionId);
  const openAppliedVersion = () => {
    if (!app.resumeVersionId) return;
    setPendingVersionId(app.resumeVersionId);
    launch(app, 'version-history');
  };
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<{ company: string; role: string; jd: string } | null>(null);
  const [extractError, setExtractError] = useState('');
  const [jdExpanded, setJdExpanded] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'interviews' | 'outcome'>(initialRoundId ? 'interviews' : 'overview');
  const roundTarget = useRef<HTMLDivElement>(null);
  useEffect(() => { if (initialRoundId) roundTarget.current?.scrollIntoView({block:'nearest'}); }, [initialRoundId]);
  const [confirmReflect, setConfirmReflect] = useState(false);
  const [prepRunning, setPrepRunning] = useState(false);
  const router = useRouter();
  const requestOpenKnowledge = useKnowledgeStore((s) => s.requestOpen);
  const runInterviewPrep = async () => {
    setPrepRunning(true);
    try {
      await useJournalStore.getState().flushApplication(app.id);
      const page = await api.knowledgeInterviewPrep(app.id, locale);
      toast.success(t('interviewPrepDone'));
      requestOpenKnowledge(page.path, false);
      onBeforeLaunchTool?.();
      router.push('/knowledge');
    } catch (error) {
      logError(t('interviewPrepFailed'), String((error as Error)?.message || error));
    } finally {
      setPrepRunning(false);
    }
  };

  const set = (patch: Partial<Application>) => update(app.id, patch);
  const saveOutcome = (result: OutcomeResult | null) => {
    const next = result ? { ...(app.outcome || {}), result } : null;
    setOutcome(app.id, next);
    if (next) setConfirmReflect(true);
  };
  const linkedMocks = useMemo(() => mocks.filter((m) => m.applicationId === app.id), [mocks, app.id]);
  const resumeMissing = !!resumes && !!app.resumeId && !resumes.some((r) => r.id === app.resumeId);
  const hasResume = !!app.resumeId && !resumeMissing;

  return (
    <div className="space-y-4">
      <AlertDialog open={confirmReflect} onOpenChange={setConfirmReflect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reflectConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('reflectConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reflectApplication(app.id)}>
              {t('reflectConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {reflection?.status === 'running' && <p className="rounded-md bg-muted p-2 text-xs">{t('reflecting')}</p>}
      {reflection?.status === 'error' && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{reflection.error}</p>
      )}
      {reflection?.status === 'done' && <ReflectionResult result={reflection.result!} />}
      {proposals.map((proposal) => (
        <KnowledgeProposalCard
          key={proposal.id}
          {...proposal}
          onResolved={() => resolveKnowledgeProposal(proposal.id)}
        />
      ))}
      <div className="sticky -top-4 z-10 flex items-center gap-2 bg-background py-1">
      <div role="tablist" aria-label={t('detailsOverview')} className="app-segments flex min-w-0 flex-1">
        {(['overview', 'interviews', 'outcome'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={detailTab === tab} onClick={() => setDetailTab(tab)} className={`flex-1 cursor-pointer rounded-lg px-2 py-2 text-xs font-medium ${detailTab === tab ? 'bg-[var(--app-field)] text-[var(--app-text)]' : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)]'}`}>
          {t(tab === 'overview' ? 'detailsOverview' : tab === 'interviews' ? 'detailsInterviews' : 'detailsOutcome')}{tab === 'interviews' && ` · ${app.interviews.length}`}
        </button>)}
      </div>
      {onDelete && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={locale === 'zh' ? '投递操作' : 'Application actions'}><MoreHorizontal /><span>{locale === 'zh' ? '更多' : 'More'}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />{locale === 'zh' ? '删除投递' : 'Delete application'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
      </div>
      <ApplicationAssistant application={app} view={detailTab} />
      <div hidden={detailTab !== 'overview'} className="space-y-5">
      <p className="text-xs leading-6 text-muted-foreground">这是一条持续补充的记录，不必一次填完。粘贴招聘信息，或只记公司、岗位，就可以开始。</p>
      {/* JD：AI 动作都围着它转 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-semibold">招聘信息 · 粘贴即可</Label>
          <button
            type="button"
            onClick={() => setJdExpanded((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {jdExpanded ? t('jdCollapse') : t('jdExpand')}
            <ChevronDown className={`h-3 w-3 transition-transform ${jdExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <Textarea
          rows={jdExpanded ? 14 : 4}
          value={app.jd}
          onChange={(e) => set({ jd: e.target.value })}
          placeholder="直接粘贴招聘信息、JD 或与 HR 的沟通片段，不必先拆分整理。可由 AI 提取公司和岗位，也可以只保留原文。"
          className="text-xs leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={extracting || !app.jd.trim() || !aiConfigured} onClick={async () => {
            setExtracting(true); setExtractError('');
            try { setExtracted(await api.intakeExtract(app.jd)); } catch (error) { setExtractError(String((error as Error)?.message || error)); } finally { setExtracting(false); }
          }}>{extracting ? <Loader2 className="animate-spin" /> : <ClipboardList />}{extracting ? '正在提取' : '提取公司与岗位'}</Button>
          {!aiConfigured && <button type="button" className="cursor-pointer text-xs underline" onClick={() => { useUIStore.getState().setSettingsTab('ai'); useUIStore.getState().openModal('settings'); }}>配置 AI 后可自动提取</button>}
          <span className="text-[11px] text-muted-foreground">先预览再应用；未提及的信息保持原样。</span>
        </div>
        {extractError && <p role="alert" className="text-xs text-destructive">{extractError}</p>}
        {extracted && <div className="space-y-3 rounded-xl border bg-muted p-3" data-intake-preview>
          <p className="text-xs font-semibold">确认提取结果</p>
          <div className="grid grid-cols-2 gap-2 text-xs"><span>公司：{extracted.company || '未提及'}</span><span>岗位：{extracted.role || '未提及'}</span></div>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-6">{extracted.jd || '原始招聘信息保持不变'}</p>
          <div className="flex gap-2"><Button size="sm" onClick={() => { set({ ...(extracted.company.trim() ? { company: extracted.company.trim() } : {}), ...(extracted.role.trim() ? { role: extracted.role.trim() } : {}) }); setExtracted(null); }}>应用公司与岗位</Button><Button size="sm" variant="ghost" onClick={() => setExtracted(null)}>放弃</Button></div>
        </div>}
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton
            icon={FileSearch}
            label={t('actionJdAnalysis')}
            disabled={!hasResume || !app.jd.trim()}
            title={!hasResume ? t('actionNeedsResume') : !app.jd.trim() ? t('actionNeedsJd') : undefined}
            onClick={() => launch(app, 'jd-analysis')}
          />
          <ToolButton
            icon={PenLine}
            label={t('actionCoverLetter')}
            disabled={!hasResume}
            title={!hasResume ? t('actionNeedsResume') : undefined}
            onClick={() => launch(app, 'cover-letter')}
          />
          <ToolButton
            icon={MessagesSquare}
            label={t('actionMockInterview')}
            disabled={!hasResume}
            title={!hasResume ? t('actionNeedsResume') : undefined}
            onClick={() => launch(app, 'interview', nextInterview(app)?.round || latestRoundName(app))}
          />
          <ToolButton
            icon={prepRunning ? Loader2 : ClipboardList}
            label={prepRunning ? t('interviewPrepRunning') : t('actionInterviewPrep')}
            disabled={!hasResume || prepRunning || !aiConfigured}
            title={!hasResume ? t('actionNeedsResume') : !aiConfigured ? t('actionNeedsAi') : undefined}
            onClick={() => void runInterviewPrep()}
          />
        </div>
      </section>


      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
          <Field label={t('fieldCompany')}>
            <Input value={app.company} onChange={(e) => set({ company: e.target.value })} placeholder={t('fieldCompany')} />
          </Field>
          <Field label={t('fieldRole')}>
            <Input value={app.role} onChange={(e) => set({ role: e.target.value })} placeholder={t('fieldRole')} />
          </Field>
        </div>
      </div>

      <div className="max-w-56">
        <Field label={t('fieldStatus')}>
          <Select value={app.status} onValueChange={(v) => set({ status: v as ApplicationStatus })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{t(STATUS_KEY[s])}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <details className="rounded-xl border p-3"><summary className="cursor-pointer text-xs font-medium">更多投递信息 · 简历、渠道、跟进与联系人（选填）</summary>
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
        {resumes && (
          <Field label={t('fieldResume')}>
            <Select
              value={resumeMissing ? NO_RESUME : app.resumeId ?? NO_RESUME}
              onValueChange={(v) => set({ resumeId: v === NO_RESUME ? null : v })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RESUME} className="text-xs">{t('resumeNone')}</SelectItem>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">{r.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {resumeMissing && <p className="text-[11px] text-red-600">{t('resumeDeleted')}</p>}
            {!resumeMissing && app.resumeId && app.resumeVersionId && (
              <button
                type="button"
                onClick={openAppliedVersion}
                className="mt-1 cursor-pointer text-[11px] text-[var(--app-accent)] underline underline-offset-2"
              >
                {tVersion('viewApplied')}
              </button>
            )}
          </Field>
        )}
        <Field label={t('fieldChannel')}>
          <Input
            list="journal-channels"
            value={app.channel}
            onChange={(e) => set({ channel: e.target.value })}
            placeholder={t('fieldChannelPlaceholder')}
          />
          <datalist id="journal-channels">
            {CHANNEL_PRESETS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label={t('fieldDate')}>
          <Input type="date" value={app.appliedDate} onChange={(e) => set({ appliedDate: e.target.value })} />
        </Field>
        <Field label={t('fieldNextFollowUp')}>
          <Input type="date" value={app.nextFollowUp} onChange={(e) => set({ nextFollowUp: e.target.value })} />
        </Field>
        <Field label={t('fieldHrName')}>
          <Input value={app.hrName} onChange={(e) => set({ hrName: e.target.value })} placeholder={t('fieldHrName')} />
        </Field>
        <Field label={t('fieldHrContact')}>
          <Input value={app.hrContact} onChange={(e) => set({ hrContact: e.target.value })} placeholder={t('fieldHrContactPlaceholder')} />
        </Field>
      </div>

      </details>
      <Field label={t('fieldNotes')}>
        <Textarea rows={2} value={app.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      </div>
      <div hidden={detailTab !== 'interviews'} className="space-y-5">
      <RecordingsPanel application={app} initialRoundId={initialRoundId} />
      {/* 面试轮次 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-semibold">{t('interviewRounds')}</Label>
          <Button variant="outline" size="sm" className="cursor-pointer gap-1" onClick={() => addInterview(app.id, {})}>
            <Plus className="h-3.5 w-3.5" />
            {t('addRound')}
          </Button>
        </div>
        {app.interviews.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">{t('noRounds')}</p>
        ) : (
          <div className="space-y-2">
            {app.interviews.map((r, i) => (
              <div key={r.id} ref={r.id === initialRoundId ? roundTarget : undefined} data-interview-round={r.id} className={r.id === initialRoundId ? 'rounded-md ring-2 ring-[var(--app-accent)]/40' : undefined}><RoundEditor
                key={r.id}
                index={i}
                round={r}
                onChange={(patch) => updateInterview(app.id, r.id, patch)}
                onRemove={() => removeInterview(app.id, r.id)}
              /></div>
            ))}
          </div>
        )}
      </section>

      </div>
      <div hidden={detailTab !== 'outcome'} className="space-y-5">
      {/* 结果 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-semibold">{t('fieldOutcome')}</Label>
          <Select
            value={app.outcome?.result ?? NO_RESUME}
            onValueChange={(v) =>
              v === NO_RESUME
                ? saveOutcome(null)
                : saveOutcome(v as OutcomeResult)
            }
          >
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RESUME} className="text-xs">{t('outcomeNone')}</SelectItem>
              {OUTCOME_RESULTS.map((o) => <SelectItem key={o} value={o} className="text-xs">{t(OUTCOME_KEY[o])}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {app.outcome && (
          <div className="space-y-2">
            <Field label={t('fieldReason')}>
              <Input value={app.outcome.reason || ''} onChange={(e) => setOutcome(app.id, { ...app.outcome!, reason: e.target.value })} />
            </Field>
            <Field label={t('fieldReflection')}>
              <Textarea rows={2} value={app.outcome.reflection || ''} onChange={(e) => setOutcome(app.id, { ...app.outcome!, reflection: e.target.value })} />
            </Field>
          </div>
        )}
      </section>

      </div>
      <div hidden={detailTab !== 'interviews'}>
      {/* 这条投递上做过的模拟面试 */}
      {linkedMocks.length > 0 && (
        <section className="space-y-2">
          <Label className="text-[13px] font-semibold">{t('mocksTab')}</Label>
          <div className="space-y-1.5">
            {linkedMocks.map((m) => (
              <MockItem key={m.id} mock={m} locale={locale} onRemove={() => void removeMock(m.id)} />
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}

function ReflectionResult({ result }: { result: api.ReflectOutput }) {
  const t = useTranslations('journal');
  return (
    <section className="space-y-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">{t('reflectionResult')}</h3>
        <a className="text-xs underline" href={`/knowledge?path=${encodeURIComponent(result.experiencePage.path)}`}>
          {t('openExperiencePage')}
        </a>
      </div>
      <ul className="list-disc space-y-1 pl-4 text-xs">{result.insights.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

function latestRoundName(app: Application): string | undefined {
  const last = app.interviews[app.interviews.length - 1];
  return last?.round || undefined;
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: typeof FileSearch;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

export function MockItem({ mock, locale, onRemove }: { mock: MockInterview; locale: string; onRemove: () => void }) {
  const t = useTranslations('journal');
  const [open, setOpen] = useState(false);
  const title = [mock.company, mock.role].filter(Boolean).join(' · ') || t('archiveTitlePrefix');
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          <span className="truncate text-[12px] font-medium text-foreground">{title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatUnixSeconds(mock.createdAt, locale)}</span>
        </button>
        <Button variant="ghost" size="icon-xs" className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {mock.feedback && (
            <div>
              <Label className="text-xs text-muted-foreground">{t('mockFeedback')}</Label>
              <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2.5 text-[12px] leading-relaxed">{mock.feedback}</div>
            </div>
          )}
          {mock.transcript && (
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-1.5 text-[12px] font-medium">{t('mockTranscript')}</summary>
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">{mock.transcript}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function RoundEditor({
  index,
  round,
  onChange,
  onRemove,
}: {
  index: number;
  round: InterviewRound;
  onChange: (patch: Partial<InterviewRound>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('journal');
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">#{index + 1}</span>
        <Input
          value={round.round}
          onChange={(e) => onChange({ round: e.target.value })}
          placeholder={t('fieldRoundPlaceholder')}
          className="h-8 flex-1"
        />
        <Select value={round.format ?? 'video'} onValueChange={(v) => onChange({ format: v as InterviewFormat })}>
          <SelectTrigger size="sm" className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTERVIEW_FORMATS.map((f) => <SelectItem key={f} value={f} className="text-xs">{t(FORMAT_KEY[f])}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-xs" className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <details><summary className="cursor-pointer py-1 text-xs text-muted-foreground">时间、地点与面试官（按需补充）</summary>
      <div className="mt-2 grid min-w-0 grid-cols-2 gap-3">
        <Field label={t('fieldScheduledAt')}>
          <Input
            type="datetime-local"
            value={round.scheduledAt || ''}
            onChange={(e) => onChange({ scheduledAt: e.target.value })}
            className="h-8"
          />
        </Field>
        <Field label={t('fieldDuration')}>
          <Input
            type="number"
            min={0}
            value={round.durationMin ?? ''}
            onChange={(e) => onChange({ durationMin: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('durationPlaceholder')}
            className="h-8"
          />
        </Field>
        <Field label={t('fieldLocation')}>
          <Input
            value={round.location || ''}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder={round.format === 'onsite' ? t('fieldLocationOnsitePlaceholder') : t('fieldLocationPlaceholder')}
            className="h-8"
          />
        </Field>
        <Field label={t('fieldInterviewer')}>
          <Input value={round.interviewer || ''} onChange={(e) => onChange({ interviewer: e.target.value })} className="h-8" />
        </Field>
      </div>
      </details>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <Field label={t('fieldTopics')}>
          <Input value={round.topics || ''} onChange={(e) => onChange({ topics: e.target.value })} className="h-8" placeholder={t('fieldTopicsPlaceholder')} />
        </Field>
        <Field label={t('fieldNotes')}>
          <Textarea rows={2} value={round.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
