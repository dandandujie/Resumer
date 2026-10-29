'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditableText } from '../fields/editable-text';
import { EditableDate } from '../fields/editable-date';
import { EditableRichText } from '../fields/editable-rich-text';
import { EditableList } from '../fields/editable-list';
import { TagListInput } from '../fields/tag-list-input';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import { SortableList } from '../dnd/sortable-item';
import { ItemCard } from '../fields/item-card';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection, ProjectsContent, ProjectItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<ProjectsContent>) => void;
}

export function ProjectsSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as ProjectsContent;
  const items = content.items || [];

  const createItem = (): ProjectItem => {
    const newItem: ProjectItem = {
      id: generateId(),
      name: '',
      description: '',
      technologies: [],
      highlights: [],
    };
    return newItem;
  };

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
    const updated = [...items];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    onUpdate({ items: updated } as any);
  };

  const updateItem = (index: number, data: Partial<ProjectItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-2">
      <SortableList items={items.map((item, index) => item.id || `proj-${index}`)} onMove={moveItem} ownHandle>
        {(_, index, handle) => {
          const item = items[index];
          return (
            <ItemCard
              key={item.id || `proj-${index}`}
              sectionId={section.id}
              itemId={item.id || `proj-${index}`}
              index={index}
              count={items.length}
              title={item.name}
              subtitle={item.startDate}
              handle={handle}
              onMove={(to) => moveItem(index, to)}
              onInsert={() => addItemAt(index)}
              onRemove={() => removeItem(index)}
            >
            <FieldWrapper>
              <EditableText field="name" label={t('projectName')} value={item.name} onChange={(v) => updateItem(index, { name: v })} />
              <EditableText field="url" label={t('website')} value={item.url || ''} onChange={(v) => updateItem(index, { url: v })} />
            </FieldWrapper>
            <FieldWrapper>
              <EditableDate field="startDate" label={t('startDate')} value={item.startDate || ''} onChange={(v) => updateItem(index, { startDate: v })} />
              <EditableDate field="endDate" label={t('endDate')} value={item.endDate || ''} onChange={(v) => updateItem(index, { endDate: v })} />
            </FieldWrapper>
            <EditableRichText field="description"
              label={t('description')}
              value={item.description}
              onChange={(v) => updateItem(index, { description: v })}
              aiContext={{ sectionId: section.id, sectionTitle: section.title, item: item.name }}
            />
            <TagListInput field="technologies" label={t('technologies')} items={item.technologies} onChange={(v) => updateItem(index, { technologies: v })} />
            <EditableList field="highlights"
              label={t('highlights')}
              items={item.highlights}
              onChange={(v) => updateItem(index, { highlights: v })}
              aiContext={{ sectionId: section.id, sectionTitle: section.title, item: item.name }}
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
