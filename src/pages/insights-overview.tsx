'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlarmClock,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  LayoutList,
  Columns3,
  Network,
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
import { Button } from '@/components/ui/button';
import { ApplicationAssistant } from '@/components/journal/application-assistant';
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
import { logError } from '@/stores/error-log-store';
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
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Application | null>(null);
  const [view, setView] = useState<InsightsView>('list');
  const [graph, setGraph] = useState<api.KnowledgeGraphData>({ nodes: [], edges: [] });
  const reflectApplication = useJournalStore((s) => s.reflectApplication);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    void fetchResumes();
    void api.knowledgeGraph().then(setGraph).catch((error) => logError(tJournal('viewGraph'), String(error)));
  }, [fetchResumes, tJournal]);

  const resumeMap = useMemo(() => new Map(resumes.map((r) => [r.id, r.title])), [resumes]);
  const resumeOptions = useMemo(() => resumes.map((r) => ({ id: r.id, title: r.title })), [resumes]);
  const agg = useMemo(() => aggregateJournal(applications), [applications]);
  const finishedCount = applications.filter((app) => ['offer', 'rejected', 'declined', 'ghosted'].includes(app.status)).length;
  const agenda = useMemo(() => buildAgenda(applications), [applications]);
  const selected = applications.find((a) => a.id === selectedId) || null;
  const mocks = useJournalStore((state) => state.mocks);
  const mergedGraph = useMemo(
    () => mergeKnowledgeGraph(graph, applications, mocks, resumes, {
      application: tJournal('graphUntitledApplication'),
      interview: tJournal('graphInterview'),
      mockInterview: tJournal('graphMockInterview'),
    }),
    [applications, graph, mocks, resumes, tJournal],
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
      resumeId: resumeFilter !== ALL_RESUMES ? resumeFilter : resumes.length === 1 ? resumes[0].id : null,
    });
    setSelectedId(app.id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (selectedId === pendingDelete.id) setSelectedId(null);
    await deleteApplication(pendingDelete.id);
    setPendingDelete(null);
  };

  const deleteDialog = (
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
            <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={() => void confirmDelete()}>
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  );
  if (selected) {
    const detailApps = filtered.some(application => application.id === selected.id) ? filtered : applications;
    return <div className="application-workspace" data-application-workspace>
      <header className="application-workspace-header"><Button variant="ghost" size="sm" data-application-back onClick={() => { setSelectedId(null); setSelectedRoundId(null); }}><ArrowLeft />{locale === 'zh' ? '返回投递列表' : 'All applications'}</Button><span className="text-[11px] text-muted-foreground">{selected.company || tJournal('untitledCompany')}</span></header>
      <div className="application-workspace-columns">
        <aside className="application-record-list"><div className="flex items-center justify-between border-b p-3"><span className="text-[11px] font-medium text-muted-foreground">{tJournal('applicationsHeading')} · {detailApps.length}</span><Button variant="ghost" size="icon-xs" onClick={() => void handleCreate()} aria-label={tJournal('addApplication')}><Plus /></Button></div><div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{detailApps.map(application => <button type="button" key={application.id} aria-current={selected.id === application.id ? 'page' : undefined} className="application-record-item" onClick={() => { setSelectedId(application.id); setSelectedRoundId(null); }}><strong className="block truncate text-xs font-medium">{application.company || tJournal('untitledCompany')}</strong><span className="mt-1 block truncate text-[11px] text-muted-foreground">{application.role || '—'}</span><span className="mt-1.5 block text-[10px] text-muted-foreground">{tJournal(STATUS_KEY[application.status])}</span></button>)}</div></aside>
        <main className="application-record-detail" data-application-detail><div className="mb-4"><p className="app-eyebrow">APPLICATION</p><h1 className="text-xl font-semibold tracking-tight">{[selected.company,selected.role].filter(Boolean).join(' · ') || tJournal('untitledCompany')}</h1></div><ApplicationEditor key={selected.id} app={selected} initialRoundId={selectedRoundId} resumes={resumeOptions} onDelete={() => setPendingDelete(selected)} onBeforeLaunchTool={() => setSelectedId(null)} /></main>
      </div>{deleteDialog}
    </div>;
  }

  return (
    <div className="app-page" data-workspace="applications">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">APPLICATIONS</p>
          <h1 className="app-page-title">{t('journalTitle')}</h1>
          <p className="app-page-description">{t('insightsHeroSubtitle')}</p>
        </div>
        {finishedCount >= 5 && (
          <button
            type="button"
            onClick={() => void api.knowledgeStrategyReview().catch((error) => logError(tJournal('strategyReview'), String(error)))}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--app-border)] px-4 py-2 text-[13px] font-semibold text-[var(--app-text)]"
          >{tJournal('strategyReview')}</button>
        )}
        <Button variant="primary" size="sm" onClick={() => void handleCreate()}>
          <Plus className="h-3.5 w-3.5" />
          {tJournal('addApplication')}
        </Button>
      </header>

      <ApplicationAssistant onCreated={setSelectedId} />
      <section className="app-metrics" aria-label={t('funnelTitle')}>
        {[
          { key: 'all' as const, label: t('funnelApplied'), count: applications.length, detail: tJournal('metricTotal') },
          { key: 'open' as const, label: t('funnelInProgress'), count: agg.pendingCount, detail: tJournal('metricActive') },
          { key: 'offer' as const, label: t('funnelOffers'), count: agg.offerCount, detail: tJournal('metricOffer') },
          { key: 'overdue' as const, label: t('funnelOverdue'), count: agg.overdueFollowUps, detail: tJournal('metricFollowUp') },
        ].map((metric) => (
          <button key={metric.key} type="button" aria-pressed={filter === metric.key} onClick={() => { setFilter(metric.key); if (view === 'graph') setView('list'); }}
            className="app-metric cursor-pointer" data-selected={filter === metric.key}>
            <span className="app-metric-label">{metric.label}</span>
            <span className="app-metric-value">{metric.count}</span>
            <span className="sr-only">{metric.detail}</span>
          </button>
        ))}
      </section>
      <div className={cn("grid min-w-0 items-start gap-5", view === 'list' && "xl:grid-cols-[minmax(0,1fr)_280px]")}>
      <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{tJournal('applicationsHeading')}</h2>
        <div className="app-segments" role="tablist" aria-label={tJournal('viewLabel')}>
          {(['list', 'kanban', 'graph'] as const).map((item) => {
            const Icon = item === 'list' ? LayoutList : item === 'kanban' ? Columns3 : Network;
            return <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors', view === item ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-sm' : 'text-[var(--app-text-muted)]')}>
              <Icon className="h-3.5 w-3.5" />{item === 'list' ? tJournal('viewList') : item === 'kanban' ? tJournal('viewKanban') : tJournal('viewGraph')}
            </button>;
          })}
        </div>
      </div>
      {/* 筛选 */}
      <section className={cn("flex flex-wrap items-center gap-2", view === 'graph' && "hidden")}>
        {filterDefs.map((item) => (
          <FilterPill
            key={item.key}
            label={item.label}
            count={item.count}
            active={filter === item.key}
            onClick={() => setFilter(item.key)}
          />
        ))}
        <span className="h-4 w-px shrink-0 bg-[var(--app-border)]" />
        <Select value={resumeFilter} onValueChange={setResumeFilter}>
          <SelectTrigger className="h-8 w-auto max-w-[220px] gap-1 rounded-md border-[var(--app-border)] bg-[var(--app-bg)] px-3 text-[12px] font-medium text-[var(--app-text-secondary)] shadow-none hover:bg-[var(--app-surface-muted)]">
            <FileText className="h-3.5 w-3.5 text-[var(--app-text-muted)]" />
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

        <div className={cn("flex flex-wrap items-center justify-between gap-3", view === 'graph' && "hidden")}>
          <label className="relative w-full max-w-[300px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('insightsSearchPlaceholder')}
              aria-label={t('insightsSearchPlaceholder')}
              className="h-8 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] pl-9 pr-3 text-[12px] outline-none transition-colors placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-text-muted)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--app-text-muted)]">{t('insightsTotal', { count: filtered.length })}</span>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-8 w-auto shrink-0 gap-1 rounded-lg border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-[12px] font-medium text-[var(--app-text-secondary)] shadow-none hover:bg-[var(--app-surface-muted)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated" className="text-xs">{t('insightsSortUpdated')}</SelectItem>
                <SelectItem value="applied" className="text-xs">{t('insightsSortApplied')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      {view === 'graph' ? (
        <KnowledgeGraph
          nodes={mergedGraph.nodes}
          edges={mergedGraph.edges}
          onNodeClick={(node) => node.id.startsWith('application:') && setSelectedId(node.id.slice('application:'.length))}
        />
      ) : view === 'kanban' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
          <p className="mb-3 text-xs text-[var(--app-text-muted)]">{tJournal('kanbanHint')}</p>
          <ApplicationKanban
            applications={filtered}
            onOpen={setSelectedId}
            onStatusChange={(id, status) => void updateApplication(id, { status })}
          />
        </div>
      ) : <section className="overflow-hidden rounded-[10px] bg-[var(--app-surface)] shadow-[0_0_0_1px_var(--app-border)]">


        {!loaded ? (
          <div className="py-16 text-center text-[13px] text-[var(--app-text-muted)]">{tCommon('loading')}</div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[13px] text-[var(--app-text-muted)]">{t('journalEmpty')}</p>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--app-text)] hover:border-[var(--app-text)]/30"
            >
              <Plus className="h-3.5 w-3.5" />
              {tJournal('addApplication')}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-[var(--app-text-muted)]">{t('insightsNoFilteredActivity')}</div>
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
                onReflect={() => void reflectApplication(app.id)}
              />
            ))}
          </ul>
        )}
      </section>}

      </div>
      <aside className={cn("grid min-w-0 gap-4 lg:grid-cols-2", view === 'list' && 'xl:grid-cols-1')}>
        <AgendaCard items={agenda} locale={locale} onOpen={(id, roundId) => { setSelectedRoundId(roundId ?? null); setSelectedId(id); }} />
        <PipelineFunnel agg={agg} />
      </aside>
      </div>

      {deleteDialog}
    </div>
  );
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        active
          ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
          : 'bg-[var(--app-surface)] text-[var(--app-text-secondary)] ring-1 ring-inset ring-[var(--app-border)] hover:bg-[var(--app-surface-muted)]'
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-[var(--app-bg)]/14' : 'bg-[var(--app-hover)] text-[var(--app-text-muted)]')}>
        {count}
      </span>
    </button>
  );
}

/** 接下来要做的事：未来 7 天的面试 + 逾期/今日跟进。 */
function AgendaCard({ items, locale, onOpen }: { items: AgendaItem[]; locale: string; onOpen: (id: string, roundId?: string) => void }) {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 4);
  return (
    <section className="flex flex-col rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--app-text)]">{t('agendaTitle')}</h3>
        <span className="text-[11px] text-[var(--app-text-muted)]">{t('agendaRange')}</span>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-center text-[13px] text-[var(--app-text-muted)]">{t('agendaEmpty')}</div>
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
                  data-agenda-round={item.round?.id}
                  onClick={() => onOpen(item.app.id, item.round?.id)}
                  className="flex w-full cursor-pointer flex-wrap items-start gap-x-2 gap-y-1 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-[var(--app-surface-muted)]"
                >
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      isInterview ? 'bg-amber-50 text-amber-700' : overdue ? 'bg-red-50 text-red-600' : 'bg-[var(--app-accent-soft)]/40 text-[var(--app-text)]'
                    )}
                  >
                    {isInterview ? <CalendarClock className="h-3.5 w-3.5" /> : <AlarmClock className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--app-text)]">{title}</span>
                    <span className="block truncate text-[11px] text-[var(--app-text-muted)]">
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
                  <span className={cn('ml-9 w-full text-[11px] font-medium tabular-nums', overdue ? 'text-red-600' : 'text-[var(--app-text-secondary)]')}>
                    {isInterview ? formatDateTime(item.round?.scheduledAt, locale) : item.app.nextFollowUp}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length > shown.length && (
            <li><button type="button" onClick={() => setExpanded(true)} className="cursor-pointer px-2.5 pt-1 text-xs text-[var(--app-accent)]">{t('agendaMore', { count: items.length - shown.length })}</button></li>
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
    { key: 'applied', label: t('funnelApplied'), count: f.applied, tone: 'bg-[var(--app-text)]' },
    { key: 'screening', label: t('funnelScreening'), count: f.screening, tone: 'bg-[var(--app-text-secondary)]' },
    { key: 'interview', label: t('funnelInterview'), count: f.interview, tone: 'bg-amber-500' },
    { key: 'offer', label: t('funnelOffer'), count: f.offer, tone: 'bg-[var(--app-text-secondary)]' },
    { key: 'closed', label: t('funnelClosed'), count: f.closed, tone: 'bg-[var(--app-text-muted)]' },
  ];
  const max = Math.max(1, ...stages.map((s) => s.count));
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const stageConv = [null, pct(f.screening, f.applied), pct(f.interview, f.screening), pct(f.offer, f.interview), null];
  const isEmpty = f.applied === 0;

  return (
    <section className="flex flex-col rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--app-text)]">{t('funnelTitle')}</h3>
        <span className="text-[11px] text-[var(--app-text-muted)]">
          {t('funnelOfferRate')} {pct(f.offer, f.applied)}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[13px] text-[var(--app-text-muted)]">{t('funnelEmpty')}</div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2">
          {stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-left text-[11px] font-medium text-[var(--app-text-secondary)]">{stage.label}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--app-surface-muted)]">
                <div
                  className={cn('h-full rounded-md transition-all', stage.tone)}
                  style={{ width: `${Math.max(stage.count > 0 ? 6 : 0, (stage.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums text-[var(--app-text)]">{stage.count}</span>
              <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-[var(--app-text-muted)]">{stageConv[i] || ''}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--app-border)] pt-3 text-[11px]">
        <span className={cn('flex items-center gap-1', agg.overdueFollowUps > 0 ? 'text-red-600' : 'text-[var(--app-text-muted)]')}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {t('funnelOverdue')} {agg.overdueFollowUps}
        </span>
        <span className="text-[var(--app-text-muted)]">{t('funnelInProgress')} {agg.pendingCount}</span>
        <span className="ml-auto text-[var(--app-text-muted)]">{t('funnelOffers')} {agg.offerCount}</span>
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
  const reflection = useJournalStore((s) => s.reflections[app.id]);
  const upcoming = nextInterview(app);
  const overdue = isOverdue(app);

  return (
    <li className="journal-application-row grid grid-cols-[minmax(0,1fr)_110px_28px] items-center gap-x-3 gap-y-3 border-b border-[var(--app-border)] p-4 text-[13px] transition-colors hover:bg-[var(--app-surface-muted)] last:border-b-0">
      <button type="button" onClick={onOpen} className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
          <Briefcase className="h-4 w-4 text-[var(--app-text-secondary)]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[var(--app-text)]">{app.company || tJournal('untitledCompany')}</span>
          <span className="mt-1 block break-words text-[12px] leading-relaxed text-[var(--app-text-muted)]">
            {[app.role || '—', app.channel, app.appliedDate].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>

      <Select value={app.status} onValueChange={(v) => onStatusChange(v as ApplicationStatus)}>
        <SelectTrigger aria-label={`${app.company} ${tJournal('fieldStatus')}`} size="sm" className={cn('h-8 w-full gap-1 rounded-full border-0 px-2.5 text-[11px] font-medium shadow-none', statusTone(app.status))}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{tJournal(STATUS_KEY[s])}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="col-span-3 row-start-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
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
            <span className="break-words text-[var(--app-text-secondary)]">
              {[upcoming.round || tJournal('stageInterview'), formatDateTime(upcoming.scheduledAt, locale), upcoming.location].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : app.nextFollowUp && (app.status === 'submitted' || app.status === 'screening' || app.status === 'interview') ? (
          <>
            <AlarmClock className={cn('h-3.5 w-3.5 shrink-0', overdue ? 'text-red-600' : 'text-[var(--app-text-muted)]')} />
            <span className={cn('break-words', overdue ? 'font-medium text-red-600' : 'text-[var(--app-text-secondary)]')}>
              {overdue ? t('agendaFollowUpOverdue', { date: app.nextFollowUp }) : `${tJournal('followUpDue')} ${app.nextFollowUp}`}
            </span>
          </>
        ) : app.interviews.length > 0 ? (
          <span className="truncate text-[var(--app-text-muted)]">{tJournal('roundsCount', { count: app.interviews.length })}</span>
        ) : (
          <span className="text-[var(--app-text-muted)]">—</span>
        )}
      </span>

      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('insightsRowDetail')} className="col-start-3 row-start-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]">
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
          <DropdownMenuItem onClick={onReflect} disabled={reflection?.status === 'running'} className="cursor-pointer">
            <FileText className="mr-2 h-4 w-4" />{tJournal('reflectAction')}
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
