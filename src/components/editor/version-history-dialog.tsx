'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { ResumePreview } from '@/components/preview/resume-preview';
import { useJournalStore } from '@/stores/journal-store';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { logError } from '@/stores/error-log-store';
import * as api from '@/lib/tauri-api';
import type { Resume } from '@/types/resume';
import { cn } from '@/lib/utils';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  /** 恢复成功后由编辑器重新拉取简历并清空撤销栈。 */
  onRestored: () => Promise<void> | void;
}

const EVENT_TONE: Record<string, string> = {
  save: 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]',
  export: 'bg-[var(--whale-mint)]/40 text-[var(--whale-ink)]',
  apply: 'bg-[var(--whale-mint-deep)] text-white',
  ai_accept: 'bg-amber-100 text-amber-800',
  restore: 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-muted)]',
};

const PREVIEW_ZOOM = 0.55;
const OriginalDocumentCanvas = lazy(() => import('./original-document-canvas').then((module) => ({ default: module.OriginalDocumentCanvas })));

function formatTime(seconds: number, locale: string) {
  return new Date(seconds * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VersionHistoryDialog({ open, onOpenChange, resumeId, onRestored }: VersionHistoryDialogProps) {
  const t = useTranslations('versionHistory');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const applications = useJournalStore((s) => s.applications);
  const [versions, setVersions] = useState<api.ResumeVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<api.ResumeVersionDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const requestedVersion = useRef<string | null>(null);

  const selectVersion = useCallback(
    async (id: string | null) => {
      setSelectedId(id);
      requestedVersion.current = id;
      setDetail(null);
      if (!id) {
        setDetail(null);
        return;
      }
      try {
        const value = await api.getResumeVersion(id);
        // 用户可能已经点了别的版本，过期的结果直接丢弃
        if (requestedVersion.current === id) setDetail(value);
      } catch (error) {
        logError(t('loadFailed'), String((error as Error)?.message || error));
      }
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 先把未落库的改动存成最新一版，列表顶部才真的是"当前"
      await useResumeStore.getState().flushPendingSave();
      const list = await api.listResumeVersions(resumeId);
      setVersions(list);
      // 从投递记录跳过来时预选那一版（一次性消费），否则选最新
      const editor = useEditorStore.getState();
      const pending = editor.pendingVersionId;
      editor.setPendingVersionId(null);
      const preferred = pending && list.some((v) => v.id === pending) ? pending : list[0]?.id;
      await selectVersion(preferred ?? null);
    } catch (error) {
      logError(t('loadFailed'), String((error as Error)?.message || error));
    } finally {
      setLoading(false);
    }
  }, [resumeId, selectVersion, t]);

  useEffect(() => {
    if (!open) return;
    // 推到下一个 tick：打开对话框与拉列表分属两次提交，避免在同一次渲染里级联 setState
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  /** 投递事件的标签从投递记录实时取，公司/岗位后来补填也能对上。 */
  const labelOf = (version: api.ResumeVersionSummary) => {
    if (version.event === 'apply') {
      const app = applications.find((a) => a.resumeVersionId === version.id);
      const target = app ? [app.company, app.role].filter(Boolean).join(' · ') : version.label;
      if (target) return t('appliedTo', { target });
    }
    if (version.event === 'export' && version.label) return t('exportedAs', { format: version.label });
    return version.label;
  };

  const previewResume = useMemo<Resume | null>(() => {
    if (!detail?.snapshot) return null;
    const snapshot = detail.snapshot;
    return { ...snapshot, sections: snapshot.sections || [], themeConfig: snapshot.themeConfig || {} } as Resume;
  }, [detail]);

  const restore = async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      await api.restoreResumeVersion(selectedId, t('restoreLabel', { time: formatTime(Date.now() / 1000, locale) }));
      await onRestored();
      toast.success(t('restored'), { position: 'bottom-right' });
      setConfirming(false);
      onOpenChange(false);
    } catch (error) {
      logError(t('restoreFailed'), String((error as Error)?.message || error));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !restoring && onOpenChange(next)}>
      <DialogContent className="flex h-[80vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--whale-divider)] px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-[var(--whale-divider)] bg-[var(--whale-sidebar)] p-2">
            {loading && (
              <div className="flex items-center gap-2 px-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('loading')}
              </div>
            )}
            {!loading && versions.length === 0 && (
              <p className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">{t('empty')}</p>
            )}
            <ol className="space-y-1">
              {versions.map((version, index) => (
                <li key={version.id}>
                  <button
                    data-resume-version={version.id}
                    type="button"
                    onClick={() => void selectVersion(version.id)}
                    aria-current={selectedId === version.id ? 'true' : undefined}
                    className={cn(
                      'w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors',
                      selectedId === version.id
                        ? 'bg-[var(--whale-card)] shadow-sm ring-1 ring-[var(--whale-divider)]'
                        : 'hover:bg-[var(--whale-cream-deep)]/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium tabular-nums text-[var(--whale-ink)]">
                        {formatTime(version.createdAt, locale)}
                      </span>
                      {index === 0 && (
                        <span className="text-[10px] text-[var(--whale-ink-muted)]">{t('current')}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', EVENT_TONE[version.event] || EVENT_TONE.save)}>
                        {t(`event.${version.event}`)}
                      </span>
                      {labelOf(version) && (
                        <span className="truncate text-[11px] text-[var(--whale-ink-soft)]">{labelOf(version)}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
          <section className="flex min-h-0 flex-col bg-[var(--whale-cream-soft)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--whale-ink-muted)]">
                {t('preview')}
              </span>
              <Button
                size="sm"
                disabled={!selectedId || restoring || versions[0]?.id === selectedId}
                onClick={() => setConfirming(true)}
                className="cursor-pointer gap-1 bg-brand hover:bg-brand-hover"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('restore')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {previewResume?.template === 'original-docx' && detail ? (
                <Suspense fallback={null}><OriginalDocumentCanvas key={detail.id} resumeId={resumeId} versionId={detail.id} readOnly /></Suspense>
              ) : previewResume ? (
                <div className="mx-auto w-[794px] origin-top bg-white shadow-md" style={{ zoom: PREVIEW_ZOOM }}>
                  <ResumePreview resume={previewResume} />
                </div>
              ) : (
                <p className="py-20 text-center text-sm text-muted-foreground">{t('selectVersion')}</p>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
      <AlertDialog open={confirming} onOpenChange={(next) => !restoring && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restoreConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('restoreConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void restore(); }} disabled={restoring}>
              {restoring ? t('restoring') : t('restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
