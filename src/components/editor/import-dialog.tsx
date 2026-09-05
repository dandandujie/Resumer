'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useResumeStore } from '@/stores/resume-store';
import { normalizeResumeDates } from '@/lib/resume-date';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileJson,
} from 'lucide-react';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

type ImportState = 'idle' | 'importing' | 'success' | 'error';

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const t = useTranslations('import');
  const { currentResume, setResume, save } = useResumeStore();

  const [state, setState] = useState<ImportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setSelectedFile(null);
    }
  }, [open]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.json')) {
      setState('error');
      setErrorMessage(t('invalidFormat'));
      return;
    }
    setSelectedFile(file);
    setState('idle');
    setErrorMessage('');
  }, [t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!selectedFile || !currentResume) return;

    setState('importing');
    setErrorMessage('');

    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data.sections)) {
        throw new Error(t('invalidFormat'));
      }

      setResume({
        ...currentResume,
        title: data.title ?? currentResume.title,
        themeConfig: data.themeConfig ?? currentResume.themeConfig,
        sections: normalizeResumeDates(data.sections),
      });

      // Mark dirty and save
      useResumeStore.setState({ isDirty: true });
      await save();

      setState('success');
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err: any) {
      setState('error');
      if (err instanceof SyntaxError) {
        setErrorMessage(t('invalidFormat'));
      } else {
        setErrorMessage(err.message || t('error'));
      }
    }
  }, [selectedFile, currentResume, setResume, save, onOpenChange, t]);

  const isLoading = state === 'importing';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isLoading) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {(state === 'idle' || (state === 'error' && selectedFile)) && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-brand bg-brand-muted'
                  : selectedFile
                    ? 'border-green-300 bg-green-50/50'
                    : 'border-border hover:border-brand hover:bg-brand-muted/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleInputChange}
                className="hidden"
              />
              {selectedFile ? (
                <>
                  <FileJson className="mb-3 h-8 w-8 text-green-500" />
                  <p className="max-w-full truncate text-sm font-medium text-[var(--whale-ink-soft)]">
                    {selectedFile.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('dragHint')}</p>
                </>
              ) : (
                <>
                  <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-[var(--whale-ink-soft)]">
                    {t('selectFile')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('dragHint')}</p>
                </>
              )}
            </div>
          )}

          {state === 'error' && !selectedFile && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-red-500" />
              <p className="text-sm font-medium text-red-600">
                {errorMessage || t('error')}
              </p>
            </div>
          )}

          {state === 'importing' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-brand" />
              <p className="text-sm font-medium text-[var(--whale-ink-soft)]">
                {t('importing')}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-3 h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-[var(--whale-ink-soft)]">
                {t('success')}
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
                onClick={handleImport}
                disabled={!selectedFile || isLoading}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('importBtn')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
