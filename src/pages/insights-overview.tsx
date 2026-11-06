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
import { applicationStatusSummary } from '@/lib/application-status-summary';
import '@/styles/applications.css';

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
        <aside className="application-record-list"><div className="flex items-center justify-between border-b p-3"><span className="text-[11px] font-medium text-muted-foreground">{tJournal('applicationsHeading')} · {detailApps.length}</span><Button variant="ghost" size="icon-xs" onClick={() => void handleCreate()} aria-label={tJournal('addApplication')}><Plus /></Button></div><div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{detailApps.map(application => <button type="button" key={application.id} aria-current={selected.id === application.id ? 'page' : undefined} className="application-record-item" onClick={() => { setSelectedId(application.id); setSelectedRoundId(null); }}><strong className="block truncate text-xs font-medium">{application.company || tJournal('untitledCompany')}</strong><span className="mt-1 block truncate text-[11px] text-muted-foreground">{application.role || '—'}</span><span className={cn("mt-1.5 block text-[10px]", statusTone(application.status))}>{tJournal(STATUS_KEY[application.status])}</span></button>)}</div></aside>
        <main className="application-record-detail" data-application-detail><div className="mb-5"><h1 className="text-xl font-semibold tracking-tight">{[selected.company,selected.role].filter(Boolean).join(' · ') || tJournal('untitledCompany')}</h1></div><ApplicationEditor key={selected.id} app={selected} initialRoundId={selectedRoundId} resumes={resumeOptions} onDelete={() => setPendingDelete(selected)} onBeforeLaunchTool={() => setSelectedId(null)} /></main>
      </div>{deleteDialog}
    </div>;
  }

  return (
    <div className="app-page" data-workspace="applications">
      <header className="app-page-header applications-heading">
        <div>
          <h1 className="app-page-title">{t('journalTitle')}</h1>
          <div className="applications-summary" aria-label={t('funnelTitle')}>
            {[
              { key: 'open' as const, label: t('funnelInProgress'), count: agg.pendingCount },
              { key: 'offer' as const, label: t('funnelOffers'), count: agg.offerCount },
              { key: 'overdue' as const, label: t('funnelOverdue'), count: agg.overdueFollowUps },
            ].map(metric => <button key={metric.key} type="button" aria-pressed={filter === metric.key} onClick={() => { setFilter(metric.key); if (view === 'graph') setView('list'); }}>
              {metric.label}<strong data-tone={metric.count === 0 ? 'neutral' : metric.key === 'offer' ? 'success' : metric.key === 'overdue' ? 'danger' : 'neutral'}>{metric.count}</strong>
            </button>)}
          </div>
        </div>
        <div className="app-actions">
          {finishedCount >= 5 && <Button variant="ghost" size="sm" onClick={() => void api.knowledgeStrategyReview().catch((error) => logError(tJournal('strategyReview'), String(error)))}>{tJournal('strategyReview')}</Button>}
          <Button variant="primary" size="sm" onClick={() => void handleCreate()}><Plus />{tJournal('addApplication')}</Button>
        </div>
      </header>

      {loaded && applications.length > 0 && <ApplicationStatusChart applications={applications} locale={locale} />}

      <section className="applications-surface" aria-label={tJournal('applicationsHeading')}>
        <div className="applications-list-heading">
          <h2>{tJournal('applicationsHeading')}<span>{t('insightsTotal', { count: filtered.length })}</span></h2>
          {view !== 'graph' && <label className="applications-search">
              <Search aria-hidden="true" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('insightsSearchPlaceholder')} aria-label={t('insightsSearchPlaceholder')} />
            </label>}
          <div className="app-segments" role="tablist" aria-label={tJournal('viewLabel')}>
            {(['list', 'kanban', 'graph'] as const).map((item) => {
              const Icon = item === 'list' ? LayoutList : item === 'kanban' ? Columns3 : Network;
              return <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const tabs = ['list', 'kanban', 'graph'] as const;
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(view) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                setView(tabs[index]);
                (event.currentTarget.parentElement?.children[index] as HTMLButtonElement)?.focus();
              }}><Icon className="h-3.5 w-3.5" />{item === 'list' ? tJournal('viewList') : item === 'kanban' ? tJournal('viewKanban') : tJournal('viewGraph')}</button>;
            })}
          </div>
        </div>
        {view !== 'graph' && <div className="applications-toolbar">
          <div className="applications-filter-tabs" aria-label={tJournal('fieldStatus')}>
            {filterDefs.map(item => <FilterPill key={item.key} label={item.label} count={item.count} active={filter === item.key} onClick={() => setFilter(item.key)} />)}
          </div>
          <div className="applications-search-controls">
            <Select value={resumeFilter} onValueChange={setResumeFilter}>
              <SelectTrigger className="applications-resume-filter" aria-label={t('insightsAllResumes')}><FileText className="h-3.5 w-3.5 shrink-0" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL_RESUMES}>{t('insightsAllResumes')}</SelectItem>{resumes.map(resume => <SelectItem key={resume.id} value={resume.id}>{resume.title}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={value => setSortMode(value as SortMode)}>
              <SelectTrigger className="applications-sort" aria-label={locale === 'zh' ? '投递排序' : 'Sort applications'}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="updated">{t('insightsSortUpdated')}</SelectItem><SelectItem value="applied">{t('insightsSortApplied')}</SelectItem></SelectContent>
            </Select>
          </div>
        </div>}
        {view === 'graph' ? <KnowledgeGraph nodes={mergedGraph.nodes} edges={mergedGraph.edges} onNodeClick={node => node.id.startsWith('application:') && setSelectedId(node.id.slice('application:'.length))} /> : view === 'kanban' ? (
          <div className="applications-kanban"><p>{tJournal('kanbanHint')}</p><ApplicationKanban applications={filtered} onOpen={setSelectedId} onStatusChange={(id, status) => void updateApplication(id, { status })} /></div>
        ) : !loaded ? <div className="app-empty">{tCommon('loading')}</div> : applications.length === 0 ? (
          <div className="app-empty"><Briefcase className="h-7 w-7" /><p>{t('journalEmpty')}</p><Button variant="outline" size="sm" onClick={() => void handleCreate()}><Plus />{tJournal('addApplication')}</Button></div>
        ) : filtered.length === 0 ? <div className="app-empty"><p>{t('insightsNoFilteredActivity')}</p><Button size="sm" variant="ghost" onClick={() => { setQuery(''); setFilter('all'); setResumeFilter(ALL_RESUMES); }}>{locale === 'zh' ? '清除筛选' : 'Clear filters'}</Button></div> : <>
          <div className="applications-table-heading" aria-hidden="true"><span>{tJournal('fieldCompany')} / {tJournal('fieldRole')}</span><span>{tJournal('fieldStatus')}</span><span>{tJournal('fieldResume')}</span><span>{locale === 'zh' ? '下一步' : 'Next step'}</span><span /></div>
          <ul className="applications-list">{filtered.map(app => <ApplicationRow key={app.id} app={app} resumeTitle={app.resumeId ? resumeMap.get(app.resumeId) : undefined} resumeDeleted={!!app.resumeId && !resumeMap.has(app.resumeId)} locale={locale} onOpen={() => setSelectedId(app.id)} onStatusChange={status => updateApplication(app.id, { status })} onOpenResume={() => app.resumeId && router.push(`/editor/${app.resumeId}`)} onDelete={() => setPendingDelete(app)} onReflect={() => void reflectApplication(app.id)} />)}</ul>
        </>}
        <div className="applications-assistant"><ApplicationAssistant onCreated={setSelectedId} /></div>
      </section>
      <div className="applications-secondary">
        <AgendaCard items={agenda} locale={locale} onOpen={(id, roundId) => { setSelectedRoundId(roundId ?? null); setSelectedId(id); }} />
        <details className="applications-funnel"><summary>{t('funnelTitle')}<span>{t('funnelOfferRate')} {applications.length ? `${Math.round(agg.offerCount / applications.length * 100)}%` : '—'}</span></summary><PipelineFunnel agg={agg} /></details>
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
      className="applications-filter-tab"
    >
      <span>{label}</span>
      <span>{count}</span>
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
    <section className="applications-secondary-section">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--app-text)]">{t('agendaTitle')}</h3>
        <span className="text-[11px] text-[var(--app-text-muted)]">{t('agendaRange')}</span>
      </div>
      {shown.length === 0 ? (
        <div className="py-1 text-xs text-[var(--app-text-muted)]">{t('agendaEmpty')}</div>
      ) : (
        <ul className="applications-agenda-items">
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
                      isInterview ? 'bg-[var(--app-hover)] text-[var(--app-status-warning)]' : overdue ? 'bg-[var(--app-hover)] text-[var(--app-status-danger)]' : 'bg-[var(--app-accent-soft)]/40 text-[var(--app-text)]'
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
                  <span className={cn('applications-agenda-date text-[11px] font-medium tabular-nums', overdue ? 'text-[var(--app-status-danger)]' : 'text-[var(--app-text-secondary)]')}>
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

function ApplicationStatusChart({ applications, locale }: { applications: Application[]; locale: string }) {
  const counts = applicationStatusSummary(applications);
  const groups = [
    { key: 'waiting', count: counts.waiting, label: locale === 'zh' ? '已投递 / 筛选中' : 'Submitted / screening', tone: 'neutral' },
    { key: 'interview', count: counts.interview, label: locale === 'zh' ? '面试中' : 'Interviewing', tone: 'warning' },
    { key: 'offer', count: counts.offer, label: 'Offer', tone: 'success' },
    { key: 'closed', count: counts.closed, label: locale === 'zh' ? '已结束' : 'Closed', tone: 'neutral' },
  ];
  return <figure className="applications-status-chart" aria-label={locale === 'zh' ? '全部投递的当前状态分布' : 'Current status of all applications'}>
    <figcaption>{locale === 'zh' ? '当前状态' : 'Current status'}<span>{locale === 'zh' ? `全部 ${applications.length} 条投递 · 每条只计一次` : `All ${applications.length} applications · counted once`}</span></figcaption>
    <dl>{groups.map(group => <div key={group.key} data-tone={group.count ? group.tone : 'neutral'}>
      <dt>{group.label}</dt><dd>{group.count}</dd>
      <div className="applications-status-track" aria-hidden="true"><span style={{ width: `${group.count / applications.length * 100}%` }} /></div>
    </div>)}</dl>
  </figure>;
}

function PipelineFunnel({ agg }: { agg: JournalAggregate }) {
  const t = useTranslations('dashboard');
  const f = agg.funnel;
  const stages: Array<{ key: string; label: string; count: number; tone: string }> = [
    { key: 'applied', label: t('funnelApplied'), count: f.applied, tone: 'bg-[var(--app-text)]' },
    { key: 'screening', label: t('funnelScreening'), count: f.screening, tone: 'bg-[var(--app-text-secondary)]' },
    { key: 'interview', label: t('funnelInterview'), count: f.interview, tone: 'bg-[var(--app-status-warning)]' },
    { key: 'offer', label: t('funnelOffer'), count: f.offer, tone: 'bg-[var(--app-status-success)]' },
    { key: 'closed', label: t('funnelClosed'), count: f.closed, tone: 'bg-[var(--app-text-muted)]' },
  ];
  const max = Math.max(1, ...stages.map((s) => s.count));
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const stageConv = [null, pct(f.screening, f.applied), pct(f.interview, f.screening), pct(f.offer, f.interview), null];
  const isEmpty = f.applied === 0;

  return (
    <section className="applications-secondary-section">
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
    <li className="journal-application-row applications-table-row">
      <button type="button" onClick={onOpen} className="application-company-cell">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
          <Briefcase className="h-4 w-4 text-[var(--app-text-secondary)]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[var(--app-text)]">{app.company || tJournal('untitledCompany')}</span>
          <span className="mt-1 block truncate text-xs text-[var(--app-text-muted)]">
            {[app.role || '—', app.channel, app.appliedDate].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>

      <Select value={app.status} onValueChange={(v) => onStatusChange(v as ApplicationStatus)}>
        <SelectTrigger aria-label={`${app.company} ${tJournal('fieldStatus')}`} size="sm" className="application-status-cell h-7 w-full gap-1 rounded-md border-0 px-2 text-[11px] font-medium shadow-none">
          <span className={statusTone(app.status)}><SelectValue /></span>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{tJournal(STATUS_KEY[s])}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="application-resume-cell flex min-w-0 items-center gap-1.5 text-xs text-[var(--app-text-muted)]">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className={cn('truncate', resumeDeleted && 'text-[var(--app-status-danger)]')}>
          {resumeTitle || (resumeDeleted ? tJournal('resumeDeleted') : tJournal('resumeNone'))}
        </span>
      </span>

      {/* 下一步：最近一场面试，或到期/逾期的跟进 */}
      <span className="application-next-cell flex min-w-0 items-center gap-1.5 text-xs">
        {upcoming ? (
          <>
            {upcoming.format === 'onsite' ? (
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--app-status-warning)]" />
            ) : (
              <Video className="h-3.5 w-3.5 shrink-0 text-[var(--app-status-warning)]" />
            )}
            <span className="break-words text-[var(--app-text-secondary)]">
              {[upcoming.round || tJournal('stageInterview'), formatDateTime(upcoming.scheduledAt, locale), upcoming.location].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : app.nextFollowUp && (app.status === 'submitted' || app.status === 'screening' || app.status === 'interview') ? (
          <>
            <AlarmClock className={cn('h-3.5 w-3.5 shrink-0', overdue ? 'text-[var(--app-status-danger)]' : 'text-[var(--app-text-muted)]')} />
            <span className={cn('break-words', overdue ? 'font-medium text-[var(--app-status-danger)]' : 'text-[var(--app-text-secondary)]')}>
              {overdue ? t('agendaFollowUpOverdue', { date: app.nextFollowUp }) : `${tJournal('followUpDue')} ${app.nextFollowUp}`}
            </span>
          </>
        ) : app.interviews.length > 0 ? (
          <span className="truncate text-[var(--app-text-muted)]">{tJournal('roundsCount', { count: app.interviews.length })}</span>
        ) : (
          <span className="text-[var(--app-text-muted)]">—</span>
        )}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={locale === 'zh' ? '投递操作' : 'Application actions'} className="application-row-menu inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]">
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
            <FileText className="mr-2 h-4 w-4" />{locale === 'zh' ? '复盘并沉淀' : 'Reflect and save insights'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-[var(--app-status-danger)] focus:text-[var(--app-status-danger)]">
            <Trash2 className="mr-2 h-4 w-4" />
            {tCommon('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
