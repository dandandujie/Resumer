'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Briefcase, MessagesSquare, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { useJournalStore, type Application } from '@/stores/journal-store';
import { useResumeStore } from '@/stores/resume-store';
import { ApplicationEditor, MockItem } from '@/components/journal/application-editor';
import { STATUS_KEY } from '@/components/journal/journal-labels';
import { cn } from '@/lib/utils';

interface JournalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

/** 编辑器里的「投递记录」：只看这份简历投过哪里；全局视图在「求职动态」。 */
export function JournalDialog({ open, onOpenChange, resumeId }: JournalDialogProps) {
  const t = useTranslations('journal');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const hydrate = useJournalStore((s) => s.hydrate);
  const applications = useJournalStore((s) => s.applications);
  const mocksAll = useJournalStore((s) => s.mocks);
  const createApplication = useJournalStore((s) => s.createApplication);
  const deleteApplication = useJournalStore((s) => s.deleteApplication);
  const removeMock = useJournalStore((s) => s.removeMock);
  const resumeTitle = useResumeStore((s) => s.currentResume?.title);

  const apps = useMemo(
    () => applications.filter((a) => a.resumeId === resumeId).sort((a, b) => b.updatedAt - a.updatedAt),
    [applications, resumeId]
  );
  const mocks = useMemo(
    () => mocksAll.filter((m) => m.resumeId === resumeId).sort((a, b) => b.createdAt - a.createdAt),
    [mocksAll, resumeId]
  );

  const [view, setView] = useState<'apps' | 'mocks'>('apps');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Application | null>(null);
  const selected = apps.find((a) => a.id === selectedId) || null;

  useEffect(() => {
    if (open) void hydrate();
  }, [open, hydrate]);

  // 打开时默认选中最近一条，省一次点击。
  useEffect(() => {
    if (open && !selectedId && apps.length > 0) setSelectedId(apps[0].id);
  }, [open, apps, selectedId]);

  const newApp = async () => {
    const a = await createApplication({ resumeId });
    setSelectedId(a.id);
    setView('apps');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (selectedId === pendingDelete.id) setSelectedId(null);
    await deleteApplication(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(760px,calc(100vh-4rem))] max-w-[960px] flex-col gap-0 p-0 sm:max-w-[960px]">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="truncate">
            {t('title')}
            {resumeTitle ? <span className="ml-2 font-normal text-muted-foreground">· {resumeTitle}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-60 shrink-0 flex-col border-r border-border">
            <div className="flex gap-1 p-2">
              {(['apps', 'mocks'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md py-1.5 text-[12px] font-medium transition-colors',
                    view === v ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {v === 'apps' ? <Briefcase className="h-3.5 w-3.5" /> : <MessagesSquare className="h-3.5 w-3.5" />}
                  {v === 'apps' ? t('threadsTab') : t('mocksTab')}
                  <span className="text-[10px] opacity-70">{v === 'apps' ? apps.length : mocks.length}</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {view === 'apps' ? (
                apps.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('threadEmpty')}</p>
                ) : (
                  <div className="space-y-1">
                    {apps.map((a) => {
                      const active = a.id === selectedId;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className={cn(
                            'w-full cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors',
                            active ? 'border-[var(--whale-ink)]/30 bg-[var(--whale-cream-soft)]' : 'border-transparent hover:bg-muted'
                          )}
                        >
                          <div className="truncate text-[13px] font-medium text-foreground">{a.company || t('untitledCompany')}</div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] text-muted-foreground">{a.role || '—'}</span>
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t(STATUS_KEY[a.status])}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : mocks.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('mockEmpty')}</p>
              ) : (
                <div className="space-y-1.5 pt-1">
                  {mocks.map((m) => (
                    <MockItem key={m.id} mock={m} locale={locale} onRemove={() => void removeMock(m.id)} />
                  ))}
                </div>
              )}
            </div>

            {view === 'apps' && (
              <div className="border-t border-border p-2">
                <Button size="sm" className="w-full cursor-pointer gap-1.5" onClick={() => void newApp()}>
                  <Plus className="h-4 w-4" />
                  {t('addApplication')}
                </Button>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {view === 'mocks' ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {t('mocksHint')}
              </div>
            ) : selected ? (
              <ApplicationEditor
                key={selected.id}
                app={selected}
                onDelete={() => setPendingDelete(selected)}
                onBeforeLaunchTool={() => onOpenChange(false)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                {t('selectThread')}
                <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={() => void newApp()}>
                  <Plus className="h-4 w-4" />
                  {t('addApplication')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? [pendingDelete.company, pendingDelete.role].filter(Boolean).join(' · ') || t('untitledCompany') : ''}
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
    </Dialog>
  );
}
