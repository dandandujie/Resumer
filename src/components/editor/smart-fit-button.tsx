'use client';

import { Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { logError } from '@/stores/error-log-store';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { calculateOptimalFit } from '@/lib/pretext-classic-estimate';

export function SmartFitButton() {
  const t = useTranslations('editor');
  const { currentResume, sections, updateThemeConfig } = useResumeStore();
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot);
  const [isCalculating, setIsCalculating] = useState(false);

  const handleSmartFit = async () => {
    if (!currentResume) return;
    
    setIsCalculating(true);
    try {
      const pretext = await import('@chenglou/pretext');
      if (currentResume.language) {
        pretext.setLocale(currentResume.language.startsWith('zh') ? 'zh' : 'en');
      }

      const liveResume = { ...currentResume, sections };
      const optimalTheme = calculateOptimalFit(pretext, liveResume);

      if (optimalTheme) {
        // Snapshot the pre-layout state (sections + current theme) so this
        // smart-layout change can be reverted with undo/redo.
        pushSnapshot(sections);
        updateThemeConfig(optimalTheme);
        toast.success(t('toolbar.smartFitSuccess'));
      } else {
        logError(t('toolbar.smartFitFailed'));
      }
    } catch (err) {
      console.error(err);
      logError(t('toolbar.smartFitError'), String((err as Error)?.message || err));
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <Button
      onClick={handleSmartFit}
      variant="ghost"
      size="sm"
      className="cursor-pointer gap-1 text-[var(--app-text-secondary)] hover:bg-[var(--app-accent-soft)]/40 hover:text-[var(--app-text)]"
      disabled={isCalculating}
      title={t('toolbar.smartFitTitle')}
    >
      {isCalculating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4 text-[var(--app-text)]" />
      )}
      <span className="ml-1 text-xs hidden sm:inline">{t('toolbar.smartFit')}</span>
    </Button>
  );
}
