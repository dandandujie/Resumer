'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { logError } from '@/stores/error-log-store';
import {
  Loader2,
  Mail,
  MessageSquareText,
  Mic,
  Copy,
  RotateCcw,
  PenLine,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { useJournalStore } from '@/stores/journal-store';
import * as api from '@/lib/tauri-api';
import type { CoverLetterStyle } from '@/lib/tauri-api';
import { cn } from '@/lib/utils';

interface CoverLetterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

const STYLE_OPTIONS: {
  value: CoverLetterStyle;
  icon: typeof Mail;
  labelKey: string;
  descKey: string;
}[] = [
  {
    value: 'boss_greeting',
    icon: MessageSquareText,
    labelKey: 'styleBoss',
    descKey: 'styleBossDesc',
  },
  {
    value: 'email',
    icon: Mail,
    labelKey: 'styleEmail',
    descKey: 'styleEmailDesc',
  },
  {
    value: 'self_intro',
    icon: Mic,
    labelKey: 'styleIntro',
    descKey: 'styleIntroDesc',
  },
];

export function CoverLetterDialog({
  open,
  onOpenChange,
  resumeId,
}: CoverLetterDialogProps) {
  const t = useTranslations('coverLetter');
  const resumeLanguage = useResumeStore((s) => s.currentResume?.language);
  const [style, setStyle] = useState<CoverLetterStyle>('boss_greeting');
  const [jobDescription, setJobDescription] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [sourceApplicationId, setSourceApplicationId] = useState<string | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const toolPrefill = useEditorStore((s) => s.toolPrefill);
  const setToolPrefill = useEditorStore((s) => s.setToolPrefill);
  const applications = useJournalStore((s) => s.applications);
  const hydrateJournal = useJournalStore((s) => s.hydrate);

  useEffect(() => {
    if (open) void hydrateJournal();
  }, [open, hydrateJournal]);

  // 从投递记录发起时把岗位上下文带进来，打开时一次性消费。
  useEffect(() => {
    if (!open || !toolPrefill) return;
    setJobDescription(toolPrefill.jd || '');
    setCompany(toolPrefill.company || '');
    setRole(toolPrefill.role || '');
    setSourceApplicationId(toolPrefill.applicationId || null);
    setResult('');
    setToolPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !sourceApplicationId) return;
    const application = applications.find(
      (item) => item.id === sourceApplicationId,
    );
    if (!application) return;
    setCompany((value) => value || application.company);
    setRole((value) => value || application.role);
    setJobDescription((value) => value || application.jd);
  }, [applications, open, sourceApplicationId]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError('');
    try {
      const text = await api.aiCoverLetter({
        resumeId,
        jobDescription: jobDescription.trim() || undefined,
        company: company.trim() || undefined,
        role: role.trim() || undefined,
        style,
        language: resumeLanguage || 'zh',
      });
      setResult(text);
    } catch (err: any) {
      setError(String(err?.message || err).slice(0, 200) || t('error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      toast.success(t('copied'));
    } catch {
      logError(t('copyFailed'));
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setResult('');
      setCompany('');
      setRole('');
      setSourceApplicationId(null);
      setError('');
    }, 200);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isGenerating) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {!result ? (
            <div className="space-y-4">
              {/* Style cards */}
              <div className="grid grid-cols-3 gap-3">
                {STYLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = style === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStyle(opt.value)}
                      className={cn(
                        'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 p-4 text-center transition-all',
                        isSelected
                          ? 'border-brand bg-brand-muted'
                          : 'border-border bg-card hover:border-[var(--whale-ink-muted)]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          isSelected ? 'text-brand' : 'text-muted-foreground',
                        )}
                      />
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isSelected
                            ? 'text-brand'
                            : 'text-[var(--whale-ink-soft)]',
                        )}
                      >
                        {t(opt.labelKey)}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {t(opt.descKey)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {t('company')}
                  </label>
                  <Input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    {t('role')}
                  </label>
                  <Input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                  />
                </div>
              </div>

              {/* Optional JD */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--whale-ink-soft)]">
                  {t('jdLabel')}
                </label>
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder={t('jdPlaceholder')}
                  className="min-h-28 resize-y text-[13px]"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="whitespace-pre-wrap rounded-xl border border-border bg-muted/50 p-4 text-[13.5px] leading-relaxed text-[var(--whale-ink-soft)]">
                {result}
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5 pt-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isGenerating}
            className="cursor-pointer"
          >
            {t('close')}
          </Button>
          {result ? (
            <>
              <Button
                variant="outline"
                onClick={() => void handleGenerate()}
                disabled={isGenerating}
                className="cursor-pointer gap-1.5"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {t('regenerate')}
              </Button>
              <Button
                onClick={() => void handleCopy()}
                className="cursor-pointer gap-1.5 bg-brand hover:bg-brand-hover"
              >
                <Copy className="h-3.5 w-3.5" />
                {t('copy')}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              className="cursor-pointer gap-1.5 bg-brand hover:bg-brand-hover"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                t('generate')
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
