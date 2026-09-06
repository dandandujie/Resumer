'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import { SortableItemActions, SortableList } from '../dnd/sortable-item';
import type { ResumeSection, LanguagesContent, LanguageItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<LanguagesContent>) => void;
}

export function LanguagesSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as LanguagesContent;
  const items = content.items || [];

  const createItem = (): LanguageItem => ({ id: generateId(), language: '', proficiency: '' });
  const addItemAt = (index = items.length) => onUpdate({ items: [...items.slice(0, index), createItem(), ...items.slice(index)] } as any);
  const addItem = () => addItemAt();
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const updated = [...items]; const [item] = updated.splice(from, 1); updated.splice(to, 0, item); onUpdate({ items: updated } as any);
  };

  const updateItem = (index: number, data: Partial<LanguageItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      <SortableList items={items.map((item, index) => item.id || `lang-${index}`)} onMove={moveItem}>
        {(_, index) => { const item = items[index]; return (
        <div key={item.id || `lang-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <FieldWrapper>
              <EditableText label={t('language')} value={item.language} onChange={(v) => updateItem(index, { language: v })} />
              <div className="flex items-end gap-1">
                <div className="flex-1">
                  <EditableText label={t('proficiency')} value={item.proficiency} onChange={(v) => updateItem(index, { proficiency: v })} />
                </div>
                <SortableItemActions index={index} count={items.length} onMove={(to) => moveItem(index, to)} onInsert={() => addItemAt(index)} onRemove={() => removeItem(index)} />
              </div>
            </FieldWrapper>
            <EditableText label={t('description')} value={(item as any).description || ''} onChange={(v) => updateItem(index, { description: v } as any)} />
          </div>
        </div>
        ); }}
      </SortableList>
      <Button variant="outline" size="sm" onClick={addItem} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
