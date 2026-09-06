'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { TemplateThumbnail, TEMPLATE_OPTIONS } from './template-thumbnail';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CreateResumeDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  onCreate: (data: { title?: string; language?: string; template?: string }) => Promise<any>;
}

export function CreateResumeDialog({ open, onClose, onImport, onCreate }: CreateResumeDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('classic');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const close = () => { onClose(); setTitle(''); setTemplate('classic'); setError(''); };
  const create = async () => {
    setIsCreating(true); setError('');
    try {
      const resume = await onCreate({ title: title || undefined, template });
      if (!resume) throw new Error(t('dashboard.createFailed'));
      close(); router.push(`/editor/${resume.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('dashboard.createFailed'));
    } finally { setIsCreating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('dashboard.createResume')}</DialogTitle>
          <DialogDescription>{t('dashboard.createResumeDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input placeholder={t('dashboard.titlePlaceholder')} value={title} onChange={(event) => setTitle(event.target.value)} />
          <div>
            <label className="mb-2 block text-sm font-medium">{t('editor.toolbar.template') || 'Template'}</label>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATE_OPTIONS.map((option) => (
                <button key={option.id} type="button" className={cn('cursor-pointer rounded-lg border-2 p-2 text-left', template === option.id ? 'border-brand bg-brand-muted' : 'border-border hover:border-brand')} onClick={() => setTemplate(option.id)}>
                  <TemplateThumbnail template={option.id} />
                  <div className="mt-2 flex items-center justify-between"><span className="text-sm font-semibold">{option.name}</span>{template === option.id && <span className="text-brand">✓</span>}</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{locale === 'zh' ? option.descZh : option.descEn}</p>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="justify-between">
          <Button variant="ghost" onClick={() => { close(); onImport(); }}>{t('import.title')}</Button>
          <div className="flex gap-2"><Button variant="outline" onClick={close}>{t('common.cancel')}</Button><Button onClick={create} disabled={isCreating} className="bg-brand hover:bg-brand-hover">{isCreating ? t('common.loading') : t('common.create')}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
