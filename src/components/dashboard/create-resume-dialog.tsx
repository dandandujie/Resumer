'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { TemplateThumbnail, TEMPLATE_OPTIONS } from './template-thumbnail';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useThemePresetsStore } from '@/stores/theme-presets-store';
import { TemplateMiniature } from '@/components/editor/template-layout-controls';
import type * as api from '@/lib/tauri-api';
import { cn } from '@/lib/utils';

interface CreateResumeDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  onCreate: (data: Parameters<typeof api.createResume>[0]) => Promise<any>;
}

export function CreateResumeDialog({ open, onClose, onImport, onCreate }: CreateResumeDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const {presets, load} = useThemePresetsStore();
  useEffect(() => { if (open) void load(); }, [open, load]);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('classic');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const close = () => { onClose(); setTitle(''); setTemplate('classic'); setError(''); };
  const create = async () => {
    setIsCreating(true); setError('');
    try {
      const preset = presets.find(p => `saved:${p.id}` === template);
      const resume = await onCreate({ title: title || undefined, template: preset?.template || (preset ? 'classic' : template), themeConfig: preset?.theme, sections: preset?.sections?.map((s, sortOrder) => ({...s, sortOrder, content: s.type === 'personal_info' ? {fullName:'',jobTitle:'',email:'',phone:'',location:''} : s.type === 'summary' ? {text:''} : s.type === 'skills' ? {categories:[]} : {items:[]} })) });
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
          <p className="text-xs leading-6 text-muted-foreground">可以直接创建：使用标准排版，名称和内容稍后补充。</p>
          <Input placeholder={t('dashboard.titlePlaceholder')} value={title} onChange={(event) => setTitle(event.target.value)} />
          <details><summary className="cursor-pointer text-sm">选择其他版式（可选）</summary><div className="mt-3">
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
          </details>
          {presets.length > 0 && <section className="space-y-2" aria-label="我的模板"><h3 className="text-sm font-semibold">我的模板</h3><div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">{presets.map(preset => <Button key={preset.id} variant={template === `saved:${preset.id}` ? 'selected' : 'outline'} aria-pressed={template === `saved:${preset.id}`} className="h-auto min-w-0 flex-col items-stretch p-2" onClick={() => setTemplate(`saved:${preset.id}`)}><TemplateMiniature template={preset.template} theme={preset.theme}/><span className="mt-1 truncate" title={preset.name}>{preset.name}</span></Button>)}</div></section>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="justify-between">
          <Button variant="ghost" onClick={() => { close(); onImport(); }}>{t('import.title')}</Button>
          <div className="flex gap-2"><Button variant="outline" onClick={close}>{t('common.cancel')}</Button><Button onClick={create} disabled={isCreating} variant="primary">{isCreating ? t('common.loading') : t('common.create')}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
