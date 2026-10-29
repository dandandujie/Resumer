'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditableText } from '../fields/editable-text';
import { FieldWrapper } from '../fields/field-wrapper';
import { createListEditor } from '@/lib/list-editor';
import { generateId } from '@/lib/utils';
import { SortableList } from '../dnd/sortable-item';
import { ItemCard } from '../fields/item-card';
import { useEditorStore } from '@/stores/editor-store';
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

  const { updateItem, removeItem } = createListEditor<LanguageItem>(
    items,
    (updated) => onUpdate({ items: updated }),
    createItem,
  );

  return (
    <div className="space-y-2">
      <SortableList items={items.map((item, index) => item.id || `lang-${index}`)} onMove={moveItem} ownHandle>
        {(_, index, handle) => {
          const item = items[index];
          return (
            <ItemCard
              key={item.id || `lang-${index}`}
              sectionId={section.id}
              itemId={item.id || `lang-${index}`}
              index={index}
              count={items.length}
              title={item.language}
              subtitle={item.proficiency}
              handle={handle}
              onMove={(to) => moveItem(index, to)}
              onInsert={() => addItemAt(index)}
              onRemove={() => removeItem(index)}
            >
              <FieldWrapper>
                <EditableText field="language" label={t('language')} value={item.language} onChange={(v) => updateItem(index, { language: v })} />
                <EditableText field="proficiency" label={t('proficiency')} value={item.proficiency} onChange={(v) => updateItem(index, { proficiency: v })} />
              </FieldWrapper>
              <EditableText field="description" label={t('description')} value={(item as any).description || ''} onChange={(v) => updateItem(index, { description: v } as any)} />
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
