'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableRichText } from '../fields/editable-rich-text';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import { SortableItemActions, SortableList } from '../dnd/sortable-item';
import type { ResumeSection, CustomContent, CustomItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<CustomContent>) => void;
}

export function CustomSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as CustomContent;
  const items = content.items || [];

  const createItem = (): CustomItem => ({ id: generateId(), title: '', description: '' });
  const addItemAt = (index = items.length) => onUpdate({ items: [...items.slice(0, index), createItem(), ...items.slice(index)] } as any);
  const addItem = () => addItemAt();
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const updated = [...items]; const [item] = updated.splice(from, 1); updated.splice(to, 0, item); onUpdate({ items: updated } as any);
  };

  const updateItem = (index: number, data: Partial<CustomItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      <SortableList items={items.map((item, index) => item.id || `custom-${index}`)} onMove={moveItem}>
        {(_, index) => { const item = items[index]; return (
        <div key={item.id || `custom-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
              <SortableItemActions index={index} count={items.length} onMove={(to) => moveItem(index, to)} onInsert={() => addItemAt(index)} onRemove={() => removeItem(index)} />
            </div>
            <FieldWrapper>
              <EditableText label="Title" value={item.title} onChange={(v) => updateItem(index, { title: v })} />
              <EditableText label="Date" value={item.date || ''} onChange={(v) => updateItem(index, { date: v })} />
            </FieldWrapper>
            <EditableRichText label={t('description')} value={item.description} onChange={(v) => updateItem(index, { description: v })} />
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
