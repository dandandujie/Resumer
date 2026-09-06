/**
 * Dashboard page — Whale Cream design.
 * Layout: hero + resume grid on the left, dark stats panel on the right.
 */
import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from '@/i18n';
import { Search, LayoutGrid, List, Sparkles, Upload, Plus, BookOpenCheck, ArrowUpRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useResume } from '@/hooks/use-resume';
import { useUIStore } from '@/stores/ui-store';
import { useRouter } from '@/i18n/routing';
import { ResumeGrid } from '@/components/dashboard/resume-grid';
import { ResumeListItem } from '@/components/dashboard/resume-list-item';
import { GenerateResumeDialog } from '@/components/dashboard/generate-resume-dialog';

import { useJournalStore, aggregateJournal, buildAgenda } from '@/stores/journal-store';
import { useLocale } from 'next-intl';
import { formatDateTime } from '@/components/journal/journal-labels';
import { cn } from '@/lib/utils';
import type { Resume } from '@/types/resume';

type SortOption = 'lastEdited' | 'created' | 'nameAsc' | 'nameDesc';
type ViewMode = 'grid' | 'list';

const VIEW_PREF_KEY = 'jade_dashboard_view';

function getInitialView(): ViewMode {
  const stored = localStorage.getItem(VIEW_PREF_KEY);
  return stored === 'list' ? 'list' : 'grid';
}

function sortResumes(resumes: Resume[], sort: SortOption): Resume[] {
  const sorted = [...resumes];
  switch (sort) {
    case 'lastEdited':
      return sorted.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    case 'created':
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'nameAsc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'nameDesc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title));
    default:
      return sorted;
  }
}

/** Compact onboarding — three concrete paths instead of a decorative hero. */
function EmptyHero({ onCreate, onAiGenerate }: { onCreate: () => void; onAiGenerate: () => void }) {
  const t = useTranslations('dashboard');
  const paths: { icon: typeof Plus; title: string; desc: string; onClick: () => void; primary?: boolean }[] = [
    { icon: Plus, title: t('emptyPathBlank'), desc: t('emptyPathBlankDesc'), onClick: onCreate, primary: true },
    { icon: Sparkles, title: t('emptyPathAi'), desc: t('emptyPathAiDesc'), onClick: onAiGenerate },
    { icon: Upload, title: t('emptyPathUpload'), desc: t('emptyPathUploadDesc'), onClick: onCreate },
  ];
  return (
    <div className="rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-5">
      <h2 className="font-display text-lg font-semibold text-[var(--whale-ink)]">{t('emptyHeroTitle')}</h2>
      <p className="mt-1 text-[13px] text-[var(--whale-ink-muted)]">{t('noResumes')}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {paths.map(({ icon: Icon, title, desc, onClick, primary }) => (
          <button
            key={title}
            type="button"
            onClick={onClick}
            className={`group flex cursor-pointer flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
              primary
                ? 'border-[var(--whale-ink)] bg-[var(--whale-ink)] text-[var(--whale-cream)] hover:bg-[var(--whale-ink-soft)]'
                : 'border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] text-[var(--whale-ink)] hover:border-[var(--whale-ink)]/30'
            }`}
          >
            <Icon className={`h-4 w-4 ${primary ? 'text-[var(--whale-mint)]' : 'text-[var(--whale-mint-deep)]'}`} />
            <span className="text-sm font-semibold">{title}</span>
            <span className={`text-[11px] leading-relaxed ${primary ? 'text-[var(--whale-cream)]/70' : 'text-[var(--whale-ink-muted)]'}`}>
              {desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatsPanel({ resumes, onOpen }: { resumes: Resume[]; onOpen: () => void }) {
  const t = useTranslations('dashboard');
  const tJournal = useTranslations('journal');
  const locale = useLocale();
  const hydrate = useJournalStore((s) => s.hydrate);
  const applications = useJournalStore((s) => s.applications);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const agg = useMemo(() => aggregateJournal(applications), [applications]);
  const agenda = useMemo(() => buildAgenda(applications).slice(0, 3), [applications]);
  const resumeCount = resumes.length;

  // 还没有任何投递：给一个安静的入口，而不是一整块空面板。
  if (agg.totalApplications === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-4 text-left transition-colors hover:border-[var(--whale-ink)]/25"
      >
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--whale-mint)]/30">
          <BookOpenCheck className="h-4 w-4 text-[var(--whale-mint-deep)]" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--whale-ink)]">{t('journalTitle')}</span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--whale-ink-muted)]">
            {t('journalEmpty')}
          </span>
        </span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--whale-ink-muted)]" />
      </button>
    );
  }

  return (
    <aside
      onClick={onOpen}
      className="group relative flex h-full cursor-pointer flex-col gap-5 overflow-hidden rounded-3xl bg-[var(--whale-ink)] p-6 text-[var(--whale-cream)] shadow-[0_24px_48px_-32px_rgba(28,26,23,0.45)] transition-transform hover:-translate-y-0.5"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--whale-mint)]/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-[var(--whale-mint)]/8 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--whale-cream)]/55">
          <span className="flex items-center gap-2">
            <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--whale-mint)]/20">
              <BookOpenCheck className="relative h-2.5 w-2.5 text-[var(--whale-mint)]" />
            </span>
            {t('journalTitle')}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="mt-4 flex items-end gap-3">
          <div className="font-display text-5xl font-semibold leading-none tabular-nums">
            {agg.totalApplications}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--whale-cream)]/40">
              / {t('journalApplications')}
            </span>
            {agg.offerCount > 0 && (
              <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--whale-mint)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--whale-mint)]">
                {agg.offerCount} {tJournal('outcomeOffer')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative h-px bg-[var(--whale-cream)]/8" />

      <div className="relative grid grid-cols-3 gap-2">
        <MiniStat label={t('journalPending')} value={agg.pendingCount} accent />
        <MiniStat label={t('journalInterviews')} value={agg.interviewedApplications} />
        <MiniStat label={t('funnelOverdue')} value={agg.overdueFollowUps} warn={agg.overdueFollowUps > 0} />
      </div>

      <div className="relative h-px bg-[var(--whale-cream)]/8" />

      {/* 接下来：最近的面试与到期跟进 */}
      <div className="relative">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--whale-cream)]/45">
          {t('agendaTitle')}
        </div>
        {agenda.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--whale-cream)]/55">{t('agendaEmptyShort')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {agenda.map((item) => (
              <li key={`${item.kind}-${item.app.id}-${item.round?.id ?? ''}`} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-[var(--whale-cream)]/85">
                  {item.app.company || tJournal('untitledCompany')}
                  <span className="text-[var(--whale-cream)]/45"> · {item.kind === 'interview' ? item.round?.round || tJournal('stageInterview') : tJournal('followUpDue')}</span>
                </span>
                <span className={`shrink-0 tabular-nums ${item.kind === 'followUpOverdue' ? 'text-red-300' : 'text-[var(--whale-cream)]/55'}`}>
                  {item.kind === 'interview' ? formatDateTime(item.round?.scheduledAt, locale) : item.app.nextFollowUp}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative mt-auto flex items-center justify-between text-[11px] text-[var(--whale-cream)]/45">
        <span>
          {resumeCount} / {t('title')}
        </span>
        <span className="font-medium text-[var(--whale-mint)]">{t('journalViewDetails')}</span>
      </div>
    </aside>
  );
}

function MiniStat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--whale-cream)]/45">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? 'text-red-300' : accent ? 'text-[var(--whale-mint)]' : 'text-[var(--whale-cream)]'}`}>
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { resumes, isLoading, fetchResumes, deleteResume, renameResume, duplicateResume } = useResume();
  const { openModal, activeModal, closeModal } = useUIStore();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('lastEdited');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    setViewMode(getInitialView());
  }, []);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_PREF_KEY, mode);
  };

  const handleDeleteClick = (id: string, title: string) => {
    setDeleteTarget({ id, title });
    // Return a promise that resolves when dialog is closed (for compatibility with onDelete signature)
    return Promise.resolve(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteResume(deleteTarget.id);
    setDeleteTarget(null);
    await fetchResumes();
  };

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  const filteredResumes = useMemo(() => {
    let result = resumes;
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter((r) => r.title.toLowerCase().includes(query));
    }
    result = sortResumes(result, sortOption);
    return result;
  }, [resumes, searchQuery, sortOption]);

  const hasResumes = resumes.length > 0;
  const hasResults = filteredResumes.length > 0;

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Left — content */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* Page title row */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--whale-ink-muted)]">
              {t('workspace')}
            </p>
            <h1 className="font-display mt-1 text-[2.125rem] font-semibold leading-tight text-[var(--whale-ink)]">
              {t('title')}
            </h1>
            {hasResumes && (
              <p className="mt-1 text-sm text-[var(--whale-ink-muted)]">
                {t('resumeCount', { count: resumes.length })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openModal('generate-resume')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-2 text-[13px] font-medium text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-soft)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('aiGenerate')}</span>
            </button>
            <button
              type="button"
              onClick={() => openModal('import')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-2 text-[13px] font-medium text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-soft)]"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('importJson')}</span>
            </button>
          </div>
        </div>

        {/* Hero — only when empty */}
        {!isLoading && !hasResumes && (
          <EmptyHero
            onCreate={() => openModal('create-resume')}
            onAiGenerate={() => openModal('generate-resume')}
          />
        )}

        {/* Filter bar */}
        {hasResumes && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--whale-ink-muted)]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="border-transparent bg-[var(--whale-card)] pl-9 text-[var(--whale-ink)] placeholder:text-[var(--whale-ink-muted)] focus-visible:border-[var(--whale-ink)] focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                <SelectTrigger
                  className="cursor-pointer border-transparent bg-[var(--whale-card)] text-[var(--whale-ink-soft)]"
                  size="sm"
                >
                  <SelectValue placeholder={t('sortBy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastEdited" className="cursor-pointer">{t('sortLastEdited')}</SelectItem>
                  <SelectItem value="created" className="cursor-pointer">{t('sortCreated')}</SelectItem>
                  <SelectItem value="nameAsc" className="cursor-pointer">{t('sortNameAsc')}</SelectItem>
                  <SelectItem value="nameDesc" className="cursor-pointer">{t('sortNameDesc')}</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center rounded-full bg-[var(--whale-card)] p-0.5">
                <button
                  type="button"
                  onClick={() => handleViewChange('grid')}
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-1 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
                      : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
                  )}
                  title={t('viewGrid')}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleViewChange('list')}
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-1 transition-colors',
                    viewMode === 'list'
                      ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]'
                      : 'text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]'
                  )}
                  title={t('viewList')}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resume list */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl bg-[var(--whale-cream-soft)]" />
            ))}
          </div>
        ) : !hasResumes ? null : !hasResults ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--whale-divider)] bg-[var(--whale-card)] py-16">
            <p className="text-sm text-[var(--whale-ink-muted)]">{t('noSearchResults')}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <ResumeGrid resumes={filteredResumes} onDelete={(id) => handleDeleteClick(id, resumes.find(r => r.id === id)?.title || '')} onDuplicate={duplicateResume} onRename={renameResume} />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredResumes.map((resume) => (
              <ResumeListItem key={resume.id} resume={resume} onDelete={() => handleDeleteClick(resume.id, resume.title)} onDuplicate={() => duplicateResume(resume.id)} onRename={(title) => renameResume(resume.id, title)} />
            ))}
          </div>
        )}
      </div>

      {/* Right — stats panel */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <StatsPanel resumes={resumes} onOpen={() => router.push('/insights')} />
      </div>

      <GenerateResumeDialog open={activeModal === 'generate-resume'} onOpenChange={(open) => open ? openModal('generate-resume') : closeModal()} onCreated={fetchResumes} />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirmMessage', { title: deleteTarget?.title || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
