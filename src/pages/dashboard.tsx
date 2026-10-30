import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, FileText, LayoutGrid, List, Plus, Search, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumeGrid } from '@/components/dashboard/resume-grid';
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
  const [pendingDelete, setPendingDelete] = useState<Resume | null>(null);
  useEffect(() => { void fetchResumes(); void hydrate(); }, [fetchResumes, hydrate]);
  const filtered = useMemo(() => sortResumes(resumes.filter(r => r.title.toLowerCase().includes(query.trim().toLowerCase())), sort), [resumes, query, sort]);
  const aggregate = useMemo(() => aggregateJournal(applications), [applications]);
  const agenda = useMemo(() => buildAgenda(applications).slice(0, 4), [applications]);
  const changeView = (next: typeof view) => { setView(next); localStorage.setItem('jade_dashboard_view', next); };
  const remove = async () => { if (!pendingDelete) return; await deleteResume(pendingDelete.id); setPendingDelete(null); await fetchResumes(); };
  return <div className="app-page" data-workspace="resumes">
    <header className="app-page-header"><div><p className="app-eyebrow">RESUMES</p><h1 className="app-page-title">{t('title')}</h1><p className="app-page-description">{zh ? '整理你的经历，准备下一次机会。' : 'Your experience, ready for the next opportunity.'}</p></div>
      <div className="app-actions"><Button variant="outline" size="sm" onClick={() => openModal('import')}><Upload />{t('importJson')}</Button><Button variant="primary" size="sm" onClick={() => openModal('create-resume')}><Plus />{t('createResume')}</Button></div>
    </header>
    <section className="app-metrics" aria-label={zh ? '求职概况' : 'Overview'}>{[
      { label: zh ? '简历' : 'RESUMES', value: resumes.length },
      { label: zh ? '投递记录' : 'APPLICATIONS', value: aggregate.totalApplications },
      { label: zh ? '进行中' : 'IN PROGRESS', value: aggregate.pendingCount },
      { label: 'OFFER', value: aggregate.offerCount },
    ].map(metric => <div className="app-metric" key={metric.label}><span className="app-metric-label">{metric.label}</span><span className="app-metric-value">{metric.value}</span></div>)}</section>
    <section className="space-y-3">
      <div className="app-toolbar"><div className="relative w-full max-w-[260px]"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 bg-background pl-8" placeholder={t('searchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="app-actions"><Select value={sort} onValueChange={v => setSort(v as Sort)}><SelectTrigger size="sm" className="h-8 border-transparent bg-transparent"><SelectValue /></SelectTrigger><SelectContent>{(['lastEdited','created','nameAsc','nameDesc'] as const).map((value, index) => <SelectItem key={value} value={value}>{t(['sortLastEdited','sortCreated','sortNameAsc','sortNameDesc'][index])}</SelectItem>)}</SelectContent></Select>
          <div className="app-segments" aria-label={zh ? '简历视图' : 'Resume view'}><button type="button" aria-pressed={view === 'list'} title={t('viewList')} onClick={() => changeView('list')}><List className="size-3.5" /></button><button type="button" aria-pressed={view === 'grid'} title={t('viewGrid')} onClick={() => changeView('grid')}><LayoutGrid className="size-3.5" /></button></div>
        </div></div>
      {isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div> : !resumes.length ? <div className="app-panel app-empty"><FileText className="size-7" /><h2 className="text-sm font-semibold text-foreground">{zh ? '从已有素材开始' : 'Start with what you have'}</h2><p className="max-w-sm text-xs leading-6">{zh ? '导入现有简历，或用一段话把经历整理成草稿。无需先填完所有资料。' : 'Import a resume or describe your experience to create a first draft.'}</p><div className="app-actions"><Button variant="outline" size="sm" onClick={() => openModal('import')}><Upload />{t('importJson')}</Button><Button variant="outline" size="sm" data-start="generate" onClick={() => openModal('generate-resume')}><Sparkles />{t('aiGenerate')}</Button></div></div> : !filtered.length ? <div className="app-panel app-empty">{t('noSearchResults')}</div> : view === 'grid' ? <ResumeGrid resumes={filtered} onDelete={id => { setPendingDelete(resumes.find(r => r.id === id) || null); return Promise.resolve(false); }} onDuplicate={duplicateResume} onRename={renameResume} /> : <div className="overflow-hidden rounded-[10px] border bg-background"><div className="flex justify-between border-b bg-muted/60 px-4 py-2 text-[10px] text-muted-foreground"><span>{zh ? '名称 / 经历摘要' : 'NAME / EXPERIENCE'}</span><span>{zh ? '最近编辑' : 'LAST EDITED'}</span></div>{filtered.map(resume => <ResumeListItem key={resume.id} resume={resume} onDelete={() => setPendingDelete(resume)} onDuplicate={() => void duplicateResume(resume.id)} onRename={title => void renameResume(resume.id,title)} />)}</div>}
      {resumes.length > 0 && <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground"><span>{t('resumeCount', { count: resumes.length })}</span><button className="app-text-action" type="button" data-start="generate" onClick={() => openModal('generate-resume')}><Sparkles className="size-3.5" />{zh ? '用一段描述生成草稿' : 'Create from a description'}</button></div>}
    </section>
    {agenda.length > 0 && <section className="app-panel"><div className="app-section-heading"><div><h2 className="app-panel-title">{t('agendaTitle')}</h2><p className="app-panel-description">{zh ? '面试与待跟进事项' : 'Interviews and follow-ups'}</p></div><button type="button" className="app-text-action" onClick={() => router.push('/insights')}>{t('journalViewDetails')}<ArrowUpRight className="size-3" /></button></div><div className="divide-y">{agenda.map(item => <button type="button" key={`${item.app.id}-${item.kind}-${item.round?.id}`} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left text-xs" onClick={() => router.push('/insights')}><span className="min-w-0 truncate"><span className="font-medium">{item.app.company || (zh ? '未命名投递' : 'Untitled')}</span><span className="ml-2 text-muted-foreground">{item.kind === 'interview' ? item.round?.round || (zh ? '面试' : 'Interview') : zh ? '跟进' : 'Follow up'}</span></span><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{item.kind === 'interview' ? formatDateTime(item.round?.scheduledAt,locale) : item.app.nextFollowUp}</span></button>)}</div></section>}
    <GenerateResumeDialog open={activeModal === 'generate-resume'} onOpenChange={open => open ? openModal('generate-resume') : closeModal()} onCreated={fetchResumes} />
    <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('deleteConfirmMessage',{title:pendingDelete?.title || ''})}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove()}>{t('delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
