'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import * as api from '@/lib/tauri-api';
import { normalizeResumeDates } from '@/lib/resume-date';
import { useResumeStore } from '@/stores/resume-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
} from 'lucide-react';

type ImportMode = 'new' | 'replace';
type ImportState = 'idle' | 'importing' | 'success' | 'error';

interface ImportResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetResumeId?: string;
}

const ACCEPT = '.json,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MIME_BY_EXTENSION: Record<string, string> = {
  json: 'application/json',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function fileType(file: File) {
  return (
    file.type ||
    MIME_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() || ''] ||
    ''
  );
}

export function ImportResumeDialog({
  open,
  onOpenChange,
  targetResumeId,
}: ImportResumeDialogProps) {
  const t = useTranslations('import');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('new');
  const [state, setState] = useState<ImportState>('idle');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setMode('new');
      setState('idle');
      setError('');
    }
  }, [open]);

  const selectFile = useCallback(
    (candidate: File) => {
      const type = fileType(candidate);
      if (!Object.values(MIME_BY_EXTENSION).includes(type)) {
        setError(t('invalidFormat'));
        setState('error');
        return;
      }
      // 完整中文字体嵌入后的 DOCX 可能超过 20 MB，必须能重新导入自己导出的文件。
      const max = type === MIME_BY_EXTENSION.docx ? 64 : 20;
      if (candidate.size > max * 1024 * 1024) {
        setError(t('fileTooLarge', { max }));
        setState('error');
        return;
      }
      setFile(candidate);
      setError('');
      setState('idle');
    },
    [t],
  );

  const importFile = useCallback(async () => {
    if (!file) return;
    setState('importing');
    setError('');
    try {
      const type = fileType(file);
      let resumeId: string;
      if (type === 'application/json') {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.sections)) throw new Error(t('invalidFormat'));
        if (mode === 'replace' && targetResumeId) {
          await useResumeStore.getState().flushPendingSave();
          await api.createResumeVersion(targetResumeId, 'import', t('beforeJsonReplace'));
          await api.updateResume(targetResumeId, {
            title: data.title || '未命名简历',
            sections: normalizeResumeDates(data.sections),
          });
          resumeId = targetResumeId;
        } else {
          resumeId = await api.createResume({
            title: data.title || '未命名简历',
            template: data.template,
            language: data.language,
            themeConfig: data.themeConfig,
            sections: normalizeResumeDates(data.sections),
          });
        }

      } else {
        resumeId = await api.parseResumeFile({
          file,
          targetResumeId: mode === 'replace' ? targetResumeId : undefined,
        });
      }
      if (mode === 'replace') {
        const current = await api.getResume(resumeId);
        if (!current) throw new Error(t('invalidFormat'));
        useResumeStore.getState().setResume(current);
      }
      setState('success');
      window.setTimeout(() => {
        onOpenChange(false);
        if (mode === 'new') router.push(`/editor/${resumeId}`);
      }, 600);
    } catch (caught) {
      setState('error');
      setError(
        caught instanceof SyntaxError
          ? t('invalidFormat')
          : caught instanceof Error
            ? caught.message
            : t('error'),
      );
    }
  }, [file, mode, onOpenChange, router, t, targetResumeId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (state !== 'importing') onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('unifiedDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-3">
          {targetResumeId && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              {(['new', 'replace'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={[
                    'rounded-md px-3 py-2 text-sm',
                    mode === value
                      ? 'bg-card font-medium shadow-sm'
                      : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {t(value === 'new' ? 'newResume' : 'replaceCurrent')}
                </button>
              ))}
            </div>
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ')
                inputRef.current?.click();
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (event.dataTransfer.files[0])
                selectFile(event.dataTransfer.files[0]);
            }}
            className={[
              'flex cursor-pointer flex-col items-center rounded-lg border-2',
              'border-dashed p-8 text-center',
              dragging
                ? 'border-brand bg-brand-muted'
                : 'border-border hover:border-brand',
            ].join(' ')}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.[0]) selectFile(event.target.files[0]);
                event.target.value = '';
              }}
            />
            {file ? (
              <>
                <FileText className="mb-2 h-8 w-8 text-[var(--app-text-secondary)]" />
                <p className="max-w-full truncate text-sm font-medium">
                  {file.name}
                </p>
              </>
            ) : (
              <>
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">{t('selectAnyFile')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('supportedFiles')}<br />{t('aiImport')}
                </p>
              </>
            )}
          </div>
          {state === 'importing' && (
            <p className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('importing')}
            </p>
          )}
          {state === 'success' && (
            <p className="flex items-center justify-center gap-2 text-sm text-[var(--app-text-secondary)]">
              <CheckCircle2 className="h-4 w-4" />
              {t('success')}
            </p>
          )}
          {state === 'error' && (
            <p className="flex items-center justify-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={state === 'importing'}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={importFile}
            disabled={!file || state === 'importing'}
            variant="primary"
          >
            {t('importBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
