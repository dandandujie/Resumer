'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { listen } from '@tauri-apps/api/event';
import {
  AlarmClock,
  Briefcase,
  CalendarClock,
  FileText,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import {
  aggregateJournal,
  buildAgenda,
  isOverdue,
  nextInterview,
  reachedInterview,
  useJournalStore,
  type AgendaItem,
  type Application,
  type ApplicationStatus,
  type JournalAggregate,
} from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApplicationEditor } from '@/components/journal/application-editor';
import { FORMAT_KEY, STATUS_KEY, formatDateTime, statusTone } from '@/components/journal/journal-labels';
import { cn } from '@/lib/utils';
import { KnowledgeProposalCard } from '@/components/ai/ai-proposal-card';
import * as api from '@/lib/tauri-api';
import { KnowledgeGraph } from '@/components/graph/knowledge-graph';
import { ApplicationKanban } from '@/components/journal/application-kanban';
import { mergeKnowledgeGraph } from '@/lib/knowledge-graph';

type FilterKey = 'all' | 'open' | 'interview' | 'offer' | 'closed' | 'overdue';
type SortMode = 'updated' | 'applied';
type InsightsView = 'list' | 'kanban' | 'graph';

const STATUS_OPTIONS: ApplicationStatus[] = ['submitted', 'screening', 'interview', 'offer', 'rejected', 'declined', 'ghosted'];
const ALL_RESUMES = '__all__';

function matchesFilter(app: Application, key: FilterKey): boolean {
  switch (key) {
    case 'all':
      return true;
    case 'open':
      return app.status === 'submitted' || app.status === 'screening' || app.status === 'interview';
    case 'interview':
      return reachedInterview(app) && app.status !== 'offer';
    case 'offer':
      return app.status === 'offer' || app.outcome?.result === 'offer';
    case 'closed':
      return app.status === 'rejected' || app.status === 'declined' || app.status === 'ghosted';
    case 'overdue':
      return isOverdue(app);
  }
}

function searchable(app: Application, resumeTitle: string | undefined): string {
  return [resumeTitle, app.company, app.role, app.channel, app.hrName, app.hrContact, app.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function InsightsOverviewPage() {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const hydrate = useJournalStore((s) => s.hydrate);
  const loaded = useJournalStore((s) => s.loaded);
  const applications = useJournalStore((s) => s.applications);
  const createApplication = useJournalStore((s) => s.createApplication);
  const updateApplication = useJournalStore((s) => s.updateApplication);
  const deleteApplication = useJournalStore((s) => s.deleteApplication);
  const { resumes, fetchResumes } = useResume();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [resumeFilter, setResumeFilter] = useState<string>(ALL_RESUMES);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Application | null>(null);
  const [view, setView] = useState<InsightsView>('list');
  const [graph, setGraph] = useState<api.KnowledgeGraphData>({ nodes: [], edges: [] });
  const [knowledgeProposals, setKnowledgeProposals] = useState<Array<{ path: string; content: string; reason: string }>>([]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    void fetchResumes();
    void api.knowledgeGraph().then(setGraph);
    let unlisten: (() => void) | undefined;
    void listen<any>('ai-chat-event', (event) => {
      if (event.payload?.event?.type === 'knowledgeProposal') {
        setKnowledgeProposals((items) => [...items, event.payload.event]);
      }
    }).then((stop) => { unlisten = stop; });
    return () => unlisten?.();
  }, [fetchResumes]);

  const resumeMap = useMemo(() => new Map(resumes.map((r) => [r.id, r.title])), [resumes]);
  const resumeOptions = useMemo(() => resumes.map((r) => ({ id: r.id, title: r.title })), [resumes]);
  const agg = useMemo(() => aggregateJournal(applications), [applications]);
  const finishedCount = applications.filter((app) => ['offer', 'rejected', 'declined', 'ghosted'].includes(app.status)).length;
  const agenda = useMemo(() => buildAgenda(applications), [applications]);
  const selected = applications.find((a) => a.id === selectedId) || null;
  const mocks = useJournalStore((state) => state.mocks);
  const mergedGraph = useMemo(
    () => mergeKnowledgeGraph(graph, applications, mocks, resumes),
    [applications, graph, mocks, resumes],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return applications
      .filter((a) => matchesFilter(a, filter))
      .filter((a) => resumeFilter === ALL_RESUMES || a.resumeId === resumeFilter)
      .filter((a) => !keyword || searchable(a, a.resumeId ? resumeMap.get(a.resumeId) : undefined).includes(keyword))
      .sort((a, b) =>
        sortMode === 'applied'
          ? (b.appliedDate || '').localeCompare(a.appliedDate || '') || b.createdAt - a.createdAt
          : b.updatedAt - a.updatedAt
      );
  }, [applications, filter, resumeFilter, query, resumeMap, sortMode]);

  const filterDefs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: t('insightsFilterAll'), count: applications.length },
    { key: 'open', label: t('journalPending'), count: agg.pendingCount },
    { key: 'interview', label: t('journalInterviews'), count: applications.filter((a) => matchesFilter(a, 'interview')).length },
    { key: 'offer', label: t('funnelOffers'), count: agg.offerCount },
    { key: 'closed', label: t('funnelClosed'), count: agg.funnel.closed },
    { key: 'overdue', label: t('funnelOverdue'), count: agg.overdueFollowUps },
  ];

  const handleCreate = async () => {
    const app = await createApplication({
      resumeId: resumeFilter !== ALL_RESUMES ? resumeFilter : null,
    });
    setSelectedId(app.id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (selectedId === pendingDelete.id) setSelectedId(null);
    await deleteApplication(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--whale-ink-muted)]">{t('workspace')}</p>
          <h1 className="font-display mt-1 text-[2.125rem] font-semibold leading-tight text-[var(--whale-ink)]">{t('journalTitle')}</h1>
          <p className="mt-1 text-[13px] text-[var(--whale-ink-muted)]">{t('insightsHeroSubtitle')}</p>
        </div>
        {finishedCount >= 5 && (
          <button
            type="button"
            onClick={() => void api.knowledgeStrategyReview()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--whale-divider)] px-4 py-2 text-[13px] font-semibold text-[var(--whale-ink)]"
          >策略回顾</button>
        )}
        <button
          type="button"
          onClick={() => void handleCreate()}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--whale-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--whale-cream)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          {tJournal('addApplication')}
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AgendaCard items={agenda} locale={locale} onOpen={setSelectedId} />
        <PipelineFunnel agg={agg} />
      </div>

      {/* 筛选 */}
      <section className="flex flex-wrap items-center gap-2">
        {filterDefs.map((item) => (
          <FilterPill
            key={item.key}
            label={item.label}
            count={item.count}
            active={filter === item.key}
            onClick={() => setFilter(item.key)}
          />
        ))}
        <span className="h-4 w-px shrink-0 bg-[var(--whale-divider)]" />
        <Select value={resumeFilter} onValueChange={setResumeFilter}>
          <SelectTrigger className="h-8 w-auto max-w-[220px] gap-1 rounded-full border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 text-[12px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
            <FileText className="h-3.5 w-3.5 text-[var(--whale-ink-muted)]" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_RESUMES} className="text-xs">{t('insightsAllResumes')}</SelectItem>
            {resumes.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-xs">{r.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <div className="flex items-center justify-end gap-1 rounded-lg border border-[var(--whale-divider)] p-0.5">
        {(['list', 'kanban', 'graph'] as const).map((item) => (
          <button key={item} type="button" onClick={() => setView(item)} className={`rounded-md px-3 py-1.5 text-xs ${view === item ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]' : 'text-[var(--whale-ink-muted)]'}`}>
            {item === 'list' ? '列表' : item === 'kanban' ? '看板' : '图谱'}
          </button>
        ))}
      </div>

      {view === 'graph' ? (
        <KnowledgeGraph
          nodes={mergedGraph.nodes}
          edges={mergedGraph.edges}
          onNodeClick={(node) => node.id.startsWith('application:') && setSelectedId(node.id.slice('application:'.length))}
        />
      ) : view === 'kanban' ? (
        <div className="overflow-x-auto rounded-2xl bg-[var(--whale-card)] p-3 shadow-[0_0_0_1px_var(--whale-divider)]">
          <ApplicationKanban
            applications={applications}
            onOpen={setSelectedId}
            onStatusChange={(id, status) => void updateApplication(id, { status })}
          />
        </div>
      ) : <section className="overflow-hidden rounded-2xl bg-[var(--whale-card)] shadow-[0_0_0_1px_var(--whale-divider)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--whale-divider)] px-4 py-2.5">
          <label className="relative w-full max-w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--whale-ink-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('insightsSearchPlaceholder')}
              className="h-8 w-full rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)] pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-[var(--whale-ink-muted)] focus:border-[var(--whale-ink-muted)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--whale-ink-muted)]">{t('insightsTotal', { count: filtered.length })}</span>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-8 w-auto shrink-0 gap-1 rounded-lg border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 text-[12px] font-medium text-[var(--whale-ink-soft)] shadow-none hover:bg-[var(--whale-cream-soft)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated" className="text-xs">{t('insightsSortUpdated')}</SelectItem>
                <SelectItem value="applied" className="text-xs">{t('insightsSortApplied')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!loaded ? (
          <div className="py-16 text-center text-[13px] text-[var(--whale-ink-muted)]">{tCommon('loading')}</div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[13px] text-[var(--whale-ink-muted)]">{t('journalEmpty')}</p>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--whale-ink)] hover:border-[var(--whale-ink)]/30"
            >
              <Plus className="h-3.5 w-3.5" />
              {tJournal('addApplication')}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[var(--whale-ink-muted)]">{t('insightsNoFilteredActivity')}</div>
        ) : (
          <ul>
            {filtered.map((app) => (
              <ApplicationRow
                key={app.id}
                app={app}
                resumeTitle={app.resumeId ? resumeMap.get(app.resumeId) : undefined}
                resumeDeleted={!!app.resumeId && !resumeMap.has(app.resumeId)}
                locale={locale}
                onOpen={() => setSelectedId(app.id)}
                onStatusChange={(status) => updateApplication(app.id, { status })}
                onOpenResume={() => app.resumeId && router.push(`/editor/${app.resumeId}`)}
                onDelete={() => setPendingDelete(app)}
                onReflect={() => void api.knowledgeReflect(app.id)}
              />
            ))}
          </ul>
        )}
      </section>}

      {knowledgeProposals.length > 0 && (
        <div className="space-y-2">
          {knowledgeProposals.map((proposal, index) => (
            <KnowledgeProposalCard key={`${proposal.path}-${index}`} {...proposal} />
          ))}
        </div>
      )}

      {/* 详情抽屉 */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
          <SheetHeader className="border-b border-[var(--whale-divider)] px-5 py-3">
            <SheetTitle className="truncate text-[15px]">
              {selected ? [selected.company, selected.role].filter(Boolean).join(' · ') || tJournal('untitledCompany') : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {selected && (
              <ApplicationEditor
                key={selected.id}
                app={selected}
                resumes={resumeOptions}
                onDelete={() => setPendingDelete(selected)}
                onBeforeLaunchTool={() => setSelectedId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('insightsConfirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? [pendingDelete.company, pendingDelete.role].filter(Boolean).join(' · ') || tJournal('untitledCompany') : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer bg-red-600 hover:bg-red-700" onClick={() => void confirmDelete()}>
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
        active
          ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
          : 'bg-[var(--whale-card)] text-[var(--whale-ink-soft)] ring-1 ring-inset ring-[var(--whale-divider)] hover:bg-[var(--whale-cream-soft)]'
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-[var(--whale-cream)]/14' : 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-muted)]')}>
        {count}
      </span>
    </button>
  );
}

/** 接下来要做的事：未来 7 天的面试 + 逾期/今日跟进。 */
function AgendaCard({ items, locale, onOpen }: { items: AgendaItem[]; locale: string; onOpen: (id: string) => void }) {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const shown = items.slice(0, 6);
  return (
    <section className="flex flex-col rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--whale-ink)]">{t('agendaTitle')}</h3>
        <span className="text-[11px] text-[var(--whale-ink-muted)]">{t('agendaRange')}</span>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-center text-[13px] text-[var(--whale-ink-muted)]">{t('agendaEmpty')}</div>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5">
          {shown.map((item) => {
            const title = [item.app.company, item.app.role].filter(Boolean).join(' · ') || tJournal('untitledCompany');
            const isInterview = item.kind === 'interview';
            const overdue = item.kind === 'followUpOverdue';
            return (
              <li key={`${item.kind}-${item.app.id}-${item.round?.id ?? ''}`}>
                <button
                  type="button"
                  onClick={() => onOpen(item.app.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--whale-cream-soft)]"
                >
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      isInterview ? 'bg-amber-50 text-amber-700' : overdue ? 'bg-red-50 text-red-600' : 'bg-[var(--whale-mint)]/40 text-[var(--whale-ink)]'
                    )}
                  >
                    {isInterview ? <CalendarClock className="h-3.5 w-3.5" /> : <AlarmClock className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--whale-ink)]">{title}</span>
                    <span className="block truncate text-[11px] text-[var(--whale-ink-muted)]">
                      {isInterview
                        ? [
                            item.round?.round || tJournal('stageInterview'),
                            item.round?.format ? tJournal(FORMAT_KEY[item.round.format]) : null,
                            item.round?.location,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : overdue
                          ? t('agendaFollowUpOverdue', { date: item.app.nextFollowUp })
                          : t('agendaFollowUpToday')}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-[11px] font-medium tabular-nums', overdue ? 'text-red-600' : 'text-[var(--whale-ink-soft)]')}>
                    {isInterview ? formatDateTime(item.round?.scheduledAt, locale) : item.app.nextFollowUp}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length > shown.length && (
            <li className="px-2.5 pt-1 text-[11px] text-[var(--whale-ink-muted)]">{t('agendaMore', { count: items.length - shown.length })}</li>
          )}
        </ul>
      )}
    </section>
  );
}

function PipelineFunnel({ agg }: { agg: JournalAggregate }) {
  const t = useTranslations('dashboard');
  const f = agg.funnel;
  const stages: Array<{ key: string; label: string; count: number; tone: string }> = [
    { key: 'applied', label: t('funnelApplied'), count: f.applied, tone: 'bg-[var(--whale-ink)]' },
    { key: 'screening', label: t('funnelScreening'), count: f.screening, tone: 'bg-[var(--whale-ink-soft)]' },
    { key: 'interview', label: t('funnelInterview'), count: f.interview, tone: 'bg-amber-500' },
    { key: 'offer', label: t('funnelOffer'), count: f.offer, tone: 'bg-emerald-500' },
    { key: 'closed', label: t('funnelClosed'), count: f.closed, tone: 'bg-[var(--whale-ink-muted)]' },
  ];
  const max = Math.max(1, ...stages.map((s) => s.count));
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const stageConv = [null, pct(f.screening, f.applied), pct(f.interview, f.screening), pct(f.offer, f.interview), null];
  const isEmpty = f.applied === 0;

  return (
    <section className="flex flex-col rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--whale-ink)]">{t('funnelTitle')}</h3>
        <span className="text-[11px] text-[var(--whale-ink-muted)]">
          {t('funnelOfferRate')} {pct(f.offer, f.applied)}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[13px] text-[var(--whale-ink-muted)]">{t('funnelEmpty')}</div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2">
          {stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-right text-[12px] font-medium text-[var(--whale-ink-soft)]">{stage.label}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--whale-cream-soft)]">
                <div
                  className={cn('h-full rounded-md transition-all', stage.tone)}
                  style={{ width: `${Math.max(stage.count > 0 ? 6 : 0, (stage.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums text-[var(--whale-ink)]">{stage.count}</span>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--whale-ink-muted)]">{stageConv[i] || ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-[var(--whale-divider)] pt-3 text-[11px]">
        <span className={cn('flex items-center gap-1', agg.overdueFollowUps > 0 ? 'text-red-600' : 'text-[var(--whale-ink-muted)]')}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {t('funnelOverdue')} {agg.overdueFollowUps}
        </span>
        <span className="text-[var(--whale-ink-muted)]">{t('funnelInProgress')} {agg.pendingCount}</span>
        <span className="ml-auto text-[var(--whale-ink-muted)]">{t('funnelOffers')} {agg.offerCount}</span>
      </div>
    </section>
  );
}

function ApplicationRow({
  app,
  resumeTitle,
  resumeDeleted,
  locale,
  onOpen,
  onStatusChange,
  onOpenResume,
  onDelete,
  onReflect,
}: {

  app: Application;
  resumeTitle?: string;
  resumeDeleted: boolean;
  locale: string;
  onOpen: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
  onOpenResume: () => void;
  onDelete: () => void;
  onReflect: () => void;
}) {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const tCommon = useTranslations('common');
  const upcoming = nextInterview(app);
  const overdue = isOverdue(app);

  return (
    <li className="grid grid-cols-[minmax(180px,1.4fr)_120px_minmax(120px,1fr)_minmax(170px,1.1fr)_40px] items-center gap-3 border-b border-[var(--whale-divider)] px-4 py-2.5 text-[12px] transition-colors hover:bg-[var(--whale-cream-soft)] last:border-b-0">
      <button type="button" onClick={onOpen} className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)]">
          <Briefcase className="h-4 w-4 text-[var(--whale-ink-soft)]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[var(--whale-ink)]">{app.company || tJournal('untitledCompany')}</span>
          <span className="block truncate text-[11px] text-[var(--whale-ink-muted)]">
            {[app.role || '—', app.channel, app.appliedDate].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>

      <Select value={app.status} onValueChange={(v) => onStatusChange(v as ApplicationStatus)}>
        <SelectTrigger size="sm" className={cn('h-7 w-full gap-1 rounded-full border-0 px-2.5 text-[11px] font-medium shadow-none', statusTone(app.status))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{tJournal(STATUS_KEY[s])}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--whale-ink-muted)]">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className={cn('truncate', resumeDeleted && 'text-red-600')}>
          {resumeTitle || (resumeDeleted ? tJournal('resumeDeleted') : tJournal('resumeNone'))}
        </span>
      </span>

      {/* 下一步：最近一场面试，或到期/逾期的跟进 */}
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
        {upcoming ? (
          <>
            {upcoming.format === 'onsite' ? (
              <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            ) : (
              <Video className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            )}
            <span className="truncate text-[var(--whale-ink-soft)]">
              {[upcoming.round || tJournal('stageInterview'), formatDateTime(upcoming.scheduledAt, locale), upcoming.location].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : app.nextFollowUp && (app.status === 'submitted' || app.status === 'screening' || app.status === 'interview') ? (
          <>
            <AlarmClock className={cn('h-3.5 w-3.5 shrink-0', overdue ? 'text-red-600' : 'text-[var(--whale-ink-muted)]')} />
            <span className={cn('truncate', overdue ? 'font-medium text-red-600' : 'text-[var(--whale-ink-soft)]')}>
              {overdue ? t('agendaFollowUpOverdue', { date: app.nextFollowUp }) : `${tJournal('followUpDue')} ${app.nextFollowUp}`}
            </span>
          </>
        ) : app.interviews.length > 0 ? (
          <span className="truncate text-[var(--whale-ink-muted)]">{tJournal('roundsCount', { count: app.interviews.length })}</span>
        ) : (
          <span className="text-[var(--whale-ink-muted)]">—</span>
        )}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen} className="cursor-pointer">
            <Briefcase className="mr-2 h-4 w-4" />
            {t('insightsRowDetail')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenResume} disabled={!app.resumeId || resumeDeleted} className="cursor-pointer">
            <FileText className="mr-2 h-4 w-4" />
            {t('insightsRowOpenResume')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReflect} className="cursor-pointer">
            <FileText className="mr-2 h-4 w-4" />复盘并沉淀
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-red-600 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            {tCommon('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
