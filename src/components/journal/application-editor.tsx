'use client';

import { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, FileSearch, MessagesSquare, PenLine, Plus, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import * as api from '@/lib/tauri-api';
import { KnowledgeProposalCard } from '@/components/ai/ai-proposal-card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useJournalStore,
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
import { FORMAT_KEY, OUTCOME_KEY, STATUS_KEY, formatUnixSeconds } from './journal-labels';

const NO_RESUME = '__none__';

export interface ResumeOption {
  id: string;
  title: string;
}

interface ApplicationEditorProps {
  app: Application;
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

export function ApplicationEditor({ app, resumes, onDelete, onBeforeLaunchTool }: ApplicationEditorProps) {
  const t = useTranslations('journal');
  const locale = useLocale();
  const update = useJournalStore((s) => s.updateApplication);
  const addInterview = useJournalStore((s) => s.addInterview);
  const updateInterview = useJournalStore((s) => s.updateInterview);
  const removeInterview = useJournalStore((s) => s.removeInterview);
  const setOutcome = useJournalStore((s) => s.setOutcome);
  const removeMock = useJournalStore((s) => s.removeMock);
  const mocks = useJournalStore((s) => s.mocks);
  const launch = useLaunchResumeTool(onBeforeLaunchTool);
  const [jdExpanded, setJdExpanded] = useState(false);
  const [proposals, setProposals] = useState<Array<{ path: string; content: string; reason: string }>>([]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void listen<any>('ai-chat-event', (event) => {
      if (event.payload?.event?.type === 'knowledgeProposal') {
        setProposals((items) => [...items, event.payload.event]);
      }
    }).then((unlisten) => { stop = unlisten; });
    return () => stop?.();
  }, []);

  const set = (patch: Partial<Application>) => update(app.id, patch);
  const saveOutcome = (result: OutcomeResult | null) => {
    const next = result ? { ...(app.outcome || {}), result } : null;
    setOutcome(app.id, next);
    if (next && window.confirm('是否复盘并沉淀这次投递？')) {
      void api.knowledgeReflect(app.id);
    }
  };
  const linkedMocks = useMemo(() => mocks.filter((m) => m.applicationId === app.id), [mocks, app.id]);
  const resumeMissing = !!resumes && !!app.resumeId && !resumes.some((r) => r.id === app.resumeId);
  const hasResume = !!app.resumeId && !resumeMissing;

  return (
    <div className="space-y-4">
      {proposals.map((proposal, index) => (
        <KnowledgeProposalCard key={`${proposal.path}-${index}`} {...proposal} />
      ))}
      <div className="flex items-start gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Field label={t('fieldCompany')}>
            <Input value={app.company} onChange={(e) => set({ company: e.target.value })} placeholder={t('fieldCompany')} />
          </Field>
          <Field label={t('fieldRole')}>
            <Input value={app.role} onChange={(e) => set({ role: e.target.value })} placeholder={t('fieldRole')} />
          </Field>
        </div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="mt-6 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title={t('delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
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
        <Field label={t('fieldStatus')}>
          <Select value={app.status} onValueChange={(v) => set({ status: v as ApplicationStatus })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{t(STATUS_KEY[s])}</SelectItem>)}
            </SelectContent>
          </Select>
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

      {/* JD：AI 动作都围着它转 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-semibold">{t('fieldJd')}</Label>
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
          placeholder={t('fieldJdPlaceholder')}
          className="text-xs leading-relaxed"
        />
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
        </div>
      </section>

      <Field label={t('fieldNotes')}>
        <Textarea rows={2} value={app.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

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
              <RoundEditor
                key={r.id}
                index={i}
                round={r}
                onChange={(patch) => updateInterview(app.id, r.id, patch)}
                onRemove={() => removeInterview(app.id, r.id)}
              />
            ))}
          </div>
        )}
      </section>

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
      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] disabled:cursor-not-allowed disabled:opacity-40"
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
      <div className="grid grid-cols-2 gap-2">
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
