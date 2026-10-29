'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Sparkles, Plus } from 'lucide-react';
import { SortableList } from '../dnd/sortable-item';
import { FieldScopeProvider } from '../fields/field-scope';
import { RichTextInput } from '../fields/rich-text-input';
import { useResumeStore } from '@/stores/resume-store';
import { extractUrlsFromResume, isValidQrUrl } from '@/lib/qrcode';
import type { ResumeSection, QrCodesContent, QrCodeItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<QrCodesContent>) => void;
}

export function QrCodesSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as QrCodesContent;
  const items = content.items || [];
  const { currentResume } = useResumeStore();
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => {
            const sections = currentResume?.sections || [];
            const detected = extractUrlsFromResume(sections);
            if (detected.length === 0) return;
            const existingUrls = new Set(items.map((q) => q.url.toLowerCase()));
            const merged = [
              ...items,
              ...detected.filter((d) => !existingUrls.has(d.url.toLowerCase())),
            ];
            onUpdate({ items: merged });
          }}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Sparkles className="h-3 w-3" />
          {t('qrAutoGenerate')}
        </button>
      </div>

      <SortableList items={items.map(item => item.id)} onMove={(from,to) => {
        const next=[...items]; const [item]=next.splice(from,1); next.splice(to,0,item); onUpdate({items:next});
      }}>
      {(_, idx) => { const qr=items[idx]; return (
        <FieldScopeProvider sectionId={section.id} itemId={qr.id}>
        <div key={qr.id} className="flex items-center gap-1.5">
          <div className="w-28 shrink-0">
            <RichTextInput value={qr.label} field="label" ariaLabel={t('qrLabel')} placeholder={t('qrLabel')} collapseOnBlur
              onChange={label => onUpdate({items:items.map((item,i)=>i===idx ? {...item,label} : item)})} />
          </div>
          <input
            type="text"
            aria-label={t('qrUrl')}
            value={qr.url}
            placeholder={t('qrUrl')}
            title={invalidIds.has(qr.id) ? t('qrUrlInvalid') : undefined}
            onChange={(e) => {
              const updated = [...items];
              updated[idx] = { ...updated[idx], url: e.target.value };
              onUpdate({ items: updated });
              if (invalidIds.has(qr.id) && (!e.target.value.trim() || isValidQrUrl(e.target.value))) {
                setInvalidIds((prev) => { const next = new Set(prev); next.delete(qr.id); return next; });
              }
            }}
            onBlur={() => {
              if (qr.url.trim() && !isValidQrUrl(qr.url)) {
                setInvalidIds((prev) => new Set(prev).add(qr.id));
              } else {
                setInvalidIds((prev) => { const next = new Set(prev); next.delete(qr.id); return next; });
              }
            }}
            className={`h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-xs outline-none ${invalidIds.has(qr.id) ? 'border-red-400 text-red-500 placeholder:text-red-300 focus:border-red-500' : 'border-[var(--whale-divider)] focus:border-[var(--whale-ink-soft)]'}`}
          />
          <button
            type="button"
            aria-label={t('removeLink')}
            onClick={() => {
              const updated = items.filter((_, i) => i !== idx);
              onUpdate({ items: updated });
            }}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        </FieldScopeProvider>
      ); }}
      </SortableList>

      <button
        type="button"
        onClick={() => {
          const newItem: QrCodeItem = { id: `qr-${Date.now()}`, label: '', url: '' };
          onUpdate({ items: [...items, newItem] });
        }}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {t('qrAdd')}
      </button>
    </div>
  );
}
