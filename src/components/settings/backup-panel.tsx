'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Archive, DatabaseBackup, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { logError } from '@/stores/error-log-store';
import * as api from '@/lib/tauri-api';

function errorMessage(error: unknown) {
  return String((error as Error)?.message || error);
}

/** 设置里的「数据与备份」区块：导出 zip / 从 zip 恢复（恢复后强制重启）。 */
export function BackupPanel({ className }: { className?: string }) {
  const t = useTranslations('settings.backup');
  const tCommon = useTranslations('common');
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState<api.RestoreResult | null>(null);

  const create = async () => {
    setCreating(true);
    try {
      const path = await api.backupCreate();
      if (path) toast.success(t('created', { path }));
    } catch (error) {
      logError(t('createFailed'), errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const result = await api.backupRestore();
      setConfirming(false);
      if (!result) return;
      if (result.settings) api.applyLocalSettings(result.settings);
      setRestored(result);
    } catch (error) {
      logError(t('restoreFailed'), errorMessage(error));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className={cn("space-y-2 rounded-lg border border-border bg-muted/40 p-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <DatabaseBackup className="h-4 w-4" />
        {t('title')}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('description')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void create()}
          disabled={creating || restoring}
          className="cursor-pointer"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          <span>{creating ? t('creating') : t('create')}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={creating || restoring}
          className="cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{t('restore')}</span>
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={(next) => !restoring && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restoreConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('restoreConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              onClick={(event) => {
                event.preventDefault();
                void restore();
              }}
            >
              {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {restoring ? t('restoring') : t('restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 恢复后数据库要在重启时替换，这里不给"稍后"选项：半恢复状态下继续用会写坏旧库 */}
      <AlertDialog open={restored !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restoredTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {restored &&
                t('restoredBody', {
                  createdAt: new Date(restored.manifest.createdAt).toLocaleString(),
                  version: restored.manifest.appVersion,
                  safety: restored.safetyBackup,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => void api.appRestart()}>{t('restartNow')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
