'use client';

import { resolveExportOfficeFonts } from '@/lib/export/fonts';
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useResumeStore } from '@/stores/resume-store';
import { generateHtml } from '@/lib/export/builders';
import { generateQrImages } from '@/lib/qrcode';
import * as api from '@/lib/tauri-api';
import type { Resume } from '@/types/resume';
import { resolveTheme } from '@/lib/theme-config';
import { logError } from '@/stores/error-log-store';
import {
  FileDown,
  FileText,
  Globe,
  AlignLeft,
  Braces,
  FileCode,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

type ExportFormat = 'pdf' | 'md' | 'docx' | 'html' | 'txt' | 'json';
type ExportState = 'idle' | 'exporting' | 'success' | 'error';

const FORMAT_OPTIONS: {
  value: ExportFormat;
  icon: typeof FileDown;
  labelKey: string;
  descKey: string;
  tooltipKey?: string;
}[] = [
  { value: 'pdf', icon: FileDown, labelKey: 'pdf', descKey: 'pdfDescription' },
  { value: 'md', icon: FileCode, labelKey: 'markdown', descKey: 'markdownDescription' },
  { value: 'docx', icon: FileText, labelKey: 'docx', descKey: 'docxDescription' },
  { value: 'html', icon: Globe, labelKey: 'html', descKey: 'htmlDescription' },
  { value: 'txt', icon: AlignLeft, labelKey: 'txt', descKey: 'txtDescription' },
  { value: 'json', icon: Braces, labelKey: 'json', descKey: 'jsonDescription' },
];

export function ExportDialog({ open, onOpenChange, resumeId }: ExportDialogProps) {
  const t = useTranslations('export');
  const { currentResume, isDirty, save } = useResumeStore();

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [state, setState] = useState<ExportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setSelectedFormat('pdf');
    }
  }, [open]);

  const handleExport = useCallback(async () => {
    setState('exporting');
    setErrorMessage('');

    try {
      // Save first if dirty
      if (isDirty) await save();

      // 标题里的路径分隔符与 Windows 非法字符会让保存对话框失败
      const title = (currentResume?.title || 'resume').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'resume';
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const extMap: Record<ExportFormat, string> = {
        'pdf': 'pdf',
        'md': 'md',
        'docx': 'docx',
        'html': 'html',
        'txt': 'txt',
        'json': 'json',
      };
      const filename = `${title}-${ts}.${extMap[selectedFormat]}`;

      let savedPath: string | null = null;
      if (selectedFormat === 'pdf') {
        const resume = (await api.getResume(resumeId)) as Resume | null;
        if (!resume) throw new Error('Resume not found');
        const html = await generateHtml(resume, true);
        savedPath = await api.exportPdf(resumeId, html, filename);
      } else if (selectedFormat === 'html') {
        const resume = (await api.getResume(resumeId)) as Resume | null;
        if (!resume) throw new Error('Resume not found');
        const html = await generateHtml(resume, false);
        savedPath = await api.exportHtml(resumeId, html, filename);
      } else if (selectedFormat === 'docx') {
        const resume = (await api.getResume(resumeId)) as Resume | null;
        if (!resume) throw new Error('Resume not found');
        // Office 字体名由前端字体方案表给出，Rust 侧不再维护第二份映射。
        const theme = resolveTheme(resume.themeConfig);
        savedPath = await api.exportDocx(
          resumeId,
          { ...theme, ...await resolveExportOfficeFonts(theme), qrImages: await generateQrImages(resume.sections) },
          filename,
        );
      } else if (selectedFormat === 'md') {
        savedPath = await api.exportMarkdown(resumeId, filename);
      } else if (selectedFormat === 'txt') {
        savedPath = await api.exportTxt(resumeId, filename);
      } else {
        savedPath = await api.exportJson(resumeId, filename);
      }

      if (savedPath === null) {
        // User canceled the save dialog — treat as idle
        setState('idle');
        return;
      }

      setState('success');
      // 留档"导出的那一版"，版本历史里能找回 HR 手里的那份
      api.createResumeVersion(resumeId, 'export', extMap[selectedFormat].toUpperCase()).catch((error) =>
        logError(t('title'), String((error as Error)?.message || error)),
      );
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err: any) {
      setState('error');
      const raw = String(err?.message || err || '');
      if (raw.includes('CHROME_NOT_FOUND')) {
        setErrorMessage(t('chromeMissing'));
      } else {
        setErrorMessage(raw || t('error'));
      }
    }
  }, [resumeId, selectedFormat, currentResume, isDirty, save, onOpenChange, t]);

  const isLoading = state === 'exporting';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isLoading) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {state === 'idle' && (
            <div className="space-y-4">
              <TooltipProvider>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {FORMAT_OPTIONS.map((format) => {
                    const Icon = format.icon;
                    const isSelected = selectedFormat === format.value;
                    const card = (
                      <button
                        key={format.value}
                        onClick={() => setSelectedFormat(format.value)}
                        className={`cursor-pointer flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all duration-150 hover:border-brand hover:bg-brand-muted/50 ${
                          isSelected
                            ? 'border-brand bg-brand-muted'
                            : 'border-border bg-card'
                        }`}
                      >
                        <Icon className={`h-6 w-6 ${isSelected ? 'text-brand' : 'text-muted-foreground'}`} />
                        <span className={`text-sm font-medium ${isSelected ? 'text-brand' : 'text-[var(--app-text-secondary)]'}`}>
                          {t(format.labelKey)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(format.descKey)}
                        </span>
                      </button>
                    );
                    if (format.tooltipKey) {
                      return (
                        <Tooltip key={format.value}>
                          <TooltipTrigger asChild>{card}</TooltipTrigger>
                          <TooltipContent side="bottom" sideOffset={6}>
                            {t(format.tooltipKey)}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return card;
                  })}
                </div>
              </TooltipProvider>
            </div>
          )}

          {state === 'exporting' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-[var(--app-text-secondary)]">
                {t('exporting')}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-[var(--app-text-secondary)] mb-3" />
              <p className="text-sm font-medium text-[var(--app-text-secondary)]">
                {t('success')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600">
                {errorMessage || t('error')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-5 pt-3">
          {(state === 'idle' || state === 'error') && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleExport}
                disabled={isLoading}
                variant="primary" className="cursor-pointer"
              >
                {t('export')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
