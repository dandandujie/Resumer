'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditableText } from '../fields/editable-text';
import { EditableRichText } from '../fields/editable-rich-text';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import { SortableList } from '../dnd/sortable-item';
import { ItemCard } from '../fields/item-card';
import { useEditorStore } from '@/stores/editor-store';
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
  const addItemAt = (index = items.length) => {
    const created = createItem();
    onUpdate({ items: [...items.slice(0, index), created, ...items.slice(index)] } as any);
    // 新条目立即成为活动条目：展开、预览高亮、光标可直接进去
    setActiveItem({ sectionId: section.id, itemId: created.id });
  };
  const addItem = () => addItemAt();
  const setActiveItem = useEditorStore((s) => s.setActiveItem);
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
    <div className="space-y-2">
      <SortableList items={items.map((item, index) => item.id || `custom-${index}`)} onMove={moveItem} ownHandle>
        {(_, index, handle) => {
          const item = items[index];
          return (
            <ItemCard
              key={item.id || `custom-${index}`}
              sectionId={section.id}
              itemId={item.id || `custom-${index}`}
              index={index}
              count={items.length}
              title={item.title}
              subtitle={item.date}
              handle={handle}
              onMove={(to) => moveItem(index, to)}
              onInsert={() => addItemAt(index)}
              onRemove={() => removeItem(index)}
            >
              <FieldWrapper>
                <EditableText field="title" label={t('customTitle')} value={item.title} onChange={(v) => updateItem(index, { title: v })} />
                <EditableText field="date" label={t('customDate')} value={item.date || ''} onChange={(v) => updateItem(index, { date: v })} />
              </FieldWrapper>
              <EditableRichText field="description"
                label={t('description')}
                value={item.description}
                onChange={(v) => updateItem(index, { description: v })}
                aiContext={{ sectionId: section.id, sectionTitle: section.title, item: item.title }}
              />
            </ItemCard>
          );
        }}
      </SortableList>
      <Button variant="outline" size="sm" onClick={addItem} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
