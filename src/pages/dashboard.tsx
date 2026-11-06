import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, FileText, LayoutGrid, List, Plus, Search, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumeCard } from '@/components/dashboard/resume-card';
import { ResumeWorkspaceLink } from '@/components/resume-workspace/resume-workspace-link';
import { listResumeWorkspaces, type ResumeWorkspaceMetadata } from '@/lib/resume-workspace-api';
import { ResumeListItem } from '@/components/dashboard/resume-list-item';
import { GenerateResumeDialog } from '@/components/dashboard/generate-resume-dialog';
import { useResume } from '@/hooks/use-resume';
import { useUIStore } from '@/stores/ui-store';
import { aggregateJournal, buildAgenda, useJournalStore } from '@/stores/journal-store';
import { useRouter } from '@/i18n/routing';
import { formatDateTime } from '@/components/journal/journal-labels';
import type { Resume } from '@/types/resume';

type Sort = 'lastEdited' | 'created' | 'nameAsc' | 'nameDesc';
function sortResumes(resumes: Resume[], sort: Sort) {
  return [...resumes].sort((a, b) => sort === 'nameAsc' ? a.title.localeCompare(b.title) : sort === 'nameDesc' ? b.title.localeCompare(a.title) : new Date(sort === 'created' ? b.createdAt : b.updatedAt).getTime() - new Date(sort === 'created' ? a.createdAt : a.updatedAt).getTime());
}
export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale(); const zh = locale === 'zh';
  const router = useRouter();
  const { resumes, isLoading, fetchResumes, deleteResume, renameResume, duplicateResume } = useResume();
  const { openModal, activeModal, closeModal } = useUIStore();
  const hydrate = useJournalStore(s => s.hydrate), applications = useJournalStore(s => s.applications);
  const [query, setQuery] = useState(''), [sort, setSort] = useState<Sort>('lastEdited');
  const [view, setView] = useState<'list' | 'grid'>(() => localStorage.getItem('jade_dashboard_view') === 'grid' ? 'grid' : 'list');
  const [scope, setScope] = useState<'base' | 'all'>('base');
  const [workspaces, setWorkspaces] = useState<ResumeWorkspaceMetadata[]>([]);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceLoadedFor, setWorkspaceLoadedFor] = useState<{ resumes: Resume[]; retry: number } | null>(null);
  const [workspaceRetry, setWorkspaceRetry] = useState(0);
  const workspaceLoading = workspaceLoadedFor?.resumes !== resumes || workspaceLoadedFor?.retry !== workspaceRetry;
  const [pendingDelete, setPendingDelete] = useState<Resume | null>(null);
  useEffect(() => { void fetchResumes(); void hydrate(); }, [fetchResumes, hydrate]);
  useEffect(() => { let active = true; listResumeWorkspaces().then(items => { if (active) { setWorkspaces(items); setWorkspaceError(''); } }).catch(e => { if (active) setWorkspaceError(String(e)); }).finally(() => { if (active) setWorkspaceLoadedFor({ resumes, retry: workspaceRetry }); }); return () => { active = false; }; }, [resumes, workspaceRetry]);
  const metadata = useMemo(() => new Map(workspaces.map(item => [item.resumeId, item])), [workspaces]);
  const targetCount = (id: string) => workspaces.filter(item => item.sourceResumeId && item.baseResumeId === id).length;
  const filtered = useMemo(() => sortResumes(resumes.filter(r => (scope === 'all' || (!workspaceError && !metadata.get(r.id)?.sourceResumeId)) && r.title.toLowerCase().includes(query.trim().toLowerCase())), sort), [resumes, query, sort, scope, metadata, workspaceError]);
  const aggregate = useMemo(() => aggregateJournal(applications), [applications]);
  const agenda = useMemo(() => buildAgenda(applications).slice(0, 4), [applications]);
  const changeView = (next: typeof view) => { setView(next); localStorage.setItem('jade_dashboard_view', next); };
  const remove = async () => { if (!pendingDelete) return; await deleteResume(pendingDelete.id); setPendingDelete(null); await fetchResumes(); };
  return <div className="app-page" data-workspace="resumes">
    <header className="app-page-header"><div><p className="app-eyebrow">RESUMES</p><h1 className="app-page-title">{t('title')}</h1><p className="app-page-description">{zh ? '基础简历积累经历，定向稿适配岗位与场景。' : 'Keep your experience in base resumes; tailor versions for each opportunity.'}</p></div>
      <div className="app-actions"><Button variant="outline" size="sm" onClick={() => openModal('import')}><Upload />{t('importJson')}</Button><Button variant="primary" size="sm" onClick={() => openModal('create-resume')}><Plus />{zh ? '新建基础简历' : 'Create base'}</Button></div>
    </header>
    <section className="app-context-invitation" aria-label="我的经历"><div><h2 className="app-panel-title">{zh ? '让经历慢慢长出细节' : 'Keep the details of your experience'}</h2><p className="app-panel-description">{zh ? '开始实习或工作后，随口留下片段。下次写简历时，再把它们找回来。' : 'Capture moments from each role, ready for your next resume.'}</p></div><Button variant="outline" size="sm" className="shrink-0" onClick={() => router.push('/work-notes')}>{zh ? '我的经历' : 'My experience'}<ArrowUpRight /></Button></section>
    <section className="app-metrics" aria-label={zh ? '求职概况' : 'Overview'}>{[
      { label: zh ? '简历' : 'RESUMES', value: resumes.length },
      { label: zh ? '投递记录' : 'APPLICATIONS', value: aggregate.totalApplications },
      { label: zh ? '进行中' : 'IN PROGRESS', value: aggregate.pendingCount },
      { label: 'OFFER', value: aggregate.offerCount },
    ].map(metric => <div className="app-metric" key={metric.label}><span className="app-metric-label">{metric.label}</span><span className="app-metric-value">{metric.value}</span></div>)}</section>
    <section className="space-y-3">
      <div className="app-segments w-fit" aria-label={zh ? '简历范围' : 'Resume scope'}><button type="button" aria-pressed={scope === 'base'} onClick={() => setScope('base')}>{zh ? '基础简历' : 'Base resumes'}</button><button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{zh ? '全部简历' : 'All resumes'}</button></div>
      {workspaceError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive"><span>{zh ? '未能加载简历归属，请重试后区分基础与定向稿。' : 'Could not load resume relationships.'}</span><Button variant="outline" size="sm" onClick={() => setWorkspaceRetry(v => v + 1)}>{zh ? '重试' : 'Retry'}</Button></div>}
      <div className="app-toolbar"><div className="relative w-full max-w-[260px]"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 bg-background pl-8" placeholder={t('searchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="app-actions"><Select value={sort} onValueChange={v => setSort(v as Sort)}><SelectTrigger size="sm" className="h-8 border-transparent bg-transparent"><SelectValue /></SelectTrigger><SelectContent>{(['lastEdited','created','nameAsc','nameDesc'] as const).map((value, index) => <SelectItem key={value} value={value}>{t(['sortLastEdited','sortCreated','sortNameAsc','sortNameDesc'][index])}</SelectItem>)}</SelectContent></Select>
          <div className="app-segments" aria-label={zh ? '简历视图' : 'Resume view'}><button type="button" aria-pressed={view === 'list'} title={t('viewList')} onClick={() => changeView('list')}><List className="size-3.5" /></button><button type="button" aria-pressed={view === 'grid'} title={t('viewGrid')} onClick={() => changeView('grid')}><LayoutGrid className="size-3.5" /></button></div>
        </div></div>
      {isLoading || workspaceLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div> : !resumes.length ? <div className="app-panel app-empty"><FileText className="size-7" /><h2 className="text-sm font-semibold text-foreground">{zh ? '从已有素材开始' : 'Start with what you have'}</h2><p className="max-w-sm text-xs leading-6">{zh ? '导入现有简历，或用一段话把经历整理成草稿。无需先填完所有资料。' : 'Import a resume or describe your experience to create a first draft.'}</p><div className="app-actions"><Button variant="outline" size="sm" onClick={() => openModal('import')}><Upload />{t('importJson')}</Button><Button variant="outline" size="sm" data-start="generate" onClick={() => openModal('generate-resume')}><Sparkles />{t('aiGenerate')}</Button></div></div> : !filtered.length ? <div className="app-panel app-empty">{workspaceError ? zh ? '简历归属暂不可用，请重试或查看全部简历。' : 'Relationships unavailable. Retry or view all resumes.' : scope === 'base' && !query.trim() ? zh ? '没有基础简历。新建或导入一份，开始积累经历。' : 'No base resumes. Create or import one to begin.' : t('noSearchResults')}</div> : view === 'grid' ? <div className="app-resume-grid">{filtered.map(resume => <div key={resume.id} className="overflow-hidden rounded-[10px] bg-background"><ResumeCard resume={resume} onDelete={() => setPendingDelete(resume)} onDuplicate={() => void duplicateResume(resume.id)} onRename={title => void renameResume(resume.id,title)} />{metadata.has(resume.id) && <ResumeWorkspaceLink resumeId={resume.id} metadata={metadata.get(resume.id)} targetCount={targetCount(resume.id)} />}</div>)}</div> : <div className="overflow-hidden rounded-[10px] border bg-background"><div className="flex justify-between border-b bg-muted/60 px-4 py-2 text-[10px] text-muted-foreground"><span>{zh ? '名称 / 经历摘要' : 'NAME / EXPERIENCE'}</span><span>{zh ? '最近编辑' : 'LAST EDITED'}</span></div>{filtered.map(resume => <div key={resume.id}><ResumeListItem resume={resume} onDelete={() => setPendingDelete(resume)} onDuplicate={() => void duplicateResume(resume.id)} onRename={title => void renameResume(resume.id,title)} />{metadata.has(resume.id) && <ResumeWorkspaceLink resumeId={resume.id} metadata={metadata.get(resume.id)} targetCount={targetCount(resume.id)} />}</div>)}</div>}
      {resumes.length > 0 && <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground"><span>{t('resumeCount', { count: resumes.length })}</span><button className="app-text-action" type="button" data-start="generate" onClick={() => openModal('generate-resume')}><Sparkles className="size-3.5" />{zh ? '用一段描述生成草稿' : 'Create from a description'}</button></div>}
    </section>
    {agenda.length > 0 && <section className="app-panel"><div className="app-section-heading"><div><h2 className="app-panel-title">{t('agendaTitle')}</h2><p className="app-panel-description">{zh ? '面试与待跟进事项' : 'Interviews and follow-ups'}</p></div><button type="button" className="app-text-action" onClick={() => router.push('/insights')}>{t('journalViewDetails')}<ArrowUpRight className="size-3" /></button></div><div className="divide-y">{agenda.map(item => <button type="button" key={`${item.app.id}-${item.kind}-${item.round?.id}`} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left text-xs" onClick={() => router.push('/insights')}><span className="min-w-0 truncate"><span className="font-medium">{item.app.company || (zh ? '未命名投递' : 'Untitled')}</span><span className="ml-2 text-muted-foreground">{item.kind === 'interview' ? item.round?.round || (zh ? '面试' : 'Interview') : zh ? '跟进' : 'Follow up'}</span></span><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{item.kind === 'interview' ? formatDateTime(item.round?.scheduledAt,locale) : item.app.nextFollowUp}</span></button>)}</div></section>}
    <GenerateResumeDialog open={activeModal === 'generate-resume'} onOpenChange={open => open ? openModal('generate-resume') : closeModal()} onCreated={fetchResumes} />
    <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('deleteConfirmMessage',{title:pendingDelete?.title || ''})}{pendingDelete && workspaces.some(item=>item.sourceResumeId===pendingDelete.id || (item.baseResumeId===pendingDelete.id && item.resumeId!==pendingDelete.id)) && <span className="mt-2 block">{zh ? '已有定向稿会保留，仍可查看创建时的来源。' : 'Existing targeted versions and their source snapshots are retained.'}</span>}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove()}>{t('delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
