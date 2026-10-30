'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useResumeStore } from '@/stores/resume-store';
import { LanguageSelect } from '@/components/ui/language-select';
import { Languages, Loader2, CheckCircle2, AlertCircle, FileEdit, FilePlus2 } from 'lucide-react';
import { translateResume } from '@/lib/ai/client-ai-service';
import { cn } from '@/lib/utils';

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

type TranslateMode = 'overwrite' | 'copy';
type TranslateState = 'idle' | 'translating' | 'success' | 'error';

interface Progress {
  completed: number;
  total: number;
}

export function TranslateDialog({ open, onOpenChange, resumeId }: TranslateDialogProps) {
  const t = useTranslations('translate');
  const router = useRouter();
  const currentResume = useResumeStore((s) => s.currentResume);

  const currentLanguage = currentResume?.language || 'en';
  const defaultTarget: 'zh' | 'en' = currentLanguage === 'zh' ? 'en' : 'zh';

  const [targetLanguage, setTargetLanguage] = useState<'zh' | 'en'>(defaultTarget);
  const [mode, setMode] = useState<TranslateMode>('overwrite');
  const [state, setState] = useState<TranslateState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState<Progress>({ completed: 0, total: 0 });
  const [failedCount, setFailedCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setProgress({ completed: 0, total: 0 });
      setFailedCount(0);
      setMode('overwrite');
      const lang = useResumeStore.getState().currentResume?.language || 'en';
      setTargetLanguage(lang === 'zh' ? 'en' : 'zh');
    } else {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  const handleTranslate = useCallback(async () => {
    setState('translating');
    setErrorMessage('');
    setProgress({ completed: 0, total: 0 });
    setFailedCount(0);

    try {
      const result = await translateResume({
        resumeId,
        targetLanguage,
        mode,
        onProgress: (completed, total, section) => {
          setProgress({ completed, total });
          if (mode === 'overwrite' && section) {
            const current = useResumeStore.getState().currentResume;
            if (current) {
              useResumeStore.getState().setResume({
                ...current,
                sections: current.sections.map((s: any) =>
                  s.id === section.sectionId
                    ? { ...s, title: section.title, content: section.content }
                    : s
                ),
              });
            }
          }
        },
      });
      setFailedCount(result.failedCount);
      setState('success');

      if (mode === 'copy' && result.newResumeId) {
        setTimeout(() => {
          onOpenChange(false);
          router.push(`/editor/${result.newResumeId}`);
        }, 1500);
      } else {
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setState('error');
      setErrorMessage(err.message || t('error'));
    }
  }, [resumeId, targetLanguage, mode, onOpenChange, t, router]);

  const progressPercent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const modeOptions: { value: TranslateMode; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'overwrite', label: t('modeOverwrite'), desc: t('modeOverwriteDesc'), icon: <FileEdit className="h-4 w-4" /> },
    { value: 'copy', label: t('modeCopy'), desc: t('modeCopyDesc'), icon: <FilePlus2 className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && state !== 'translating') onOpenChange(false); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          {/* Language Selector */}
          {state === 'idle' && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--app-text-secondary)]">
                  {t('targetLanguage')}
                </label>
                <LanguageSelect value={targetLanguage} onValueChange={(v) => setTargetLanguage(v as 'zh' | 'en')} />
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-2.5">
                {modeOptions.map((opt) => {
                  const active = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMode(opt.value)}
                      className={cn(
                        'relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition-all cursor-pointer',
                        active
                          ? 'border-brand bg-brand-muted'
                          : 'border-border bg-card hover:border-[var(--app-text-muted)]'
                      )}
                    >
                      <span className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                        active
                          ? 'bg-brand text-white'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {opt.icon}
                      </span>
                      <span className={cn(
                        'text-sm font-semibold',
                        active ? 'text-brand' : 'text-[var(--app-text-secondary)]'
                      )}>
                        {opt.label}
                      </span>
                      <span className="text-[11px] leading-tight text-muted-foreground">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Translating State */}
          {state === 'translating' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-[var(--app-text-secondary)] mb-3">
                {progress.total > 0
                  ? t('progress', { completed: progress.completed, total: progress.total })
                  : t('translating')}
              </p>
              {progress.total > 0 && (
                <div className="w-full max-w-xs">
                  <div className="h-2 bg-[var(--app-hover)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-[var(--app-text-secondary)] mb-3" />
              <p className="text-sm font-medium text-[var(--app-text-secondary)]">
                {failedCount > 0
                  ? t('partialSuccess', { failed: failedCount })
                  : t('success')}
              </p>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600">
                {errorMessage || t('error')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 pb-5 pt-3">
          {state === 'idle' && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleTranslate}
                variant="primary" className="cursor-pointer"
              >
                {t('translateAll')}
              </Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleTranslate}
                variant="primary" className="cursor-pointer"
              >
                {t('translateAll')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
