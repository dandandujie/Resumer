'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableDate } from '../fields/editable-date';
import { EditableRichText } from '../fields/editable-rich-text';
import { EditableList } from '../fields/editable-list';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import { SortableItemActions, SortableList } from '../dnd/sortable-item';
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

  const addItemAt = (index = items.length) => onUpdate({ items: [...items.slice(0, index), createItem(), ...items.slice(index)] } as any);
  const addItem = () => addItemAt();
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
    <div className="space-y-4">
      <SortableList items={items.map((item, index) => item.id || `proj-${index}`)} onMove={moveItem}>
        {(_, index) => {
          const item = items[index];
          return (
        <div key={item.id || `proj-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
              <SortableItemActions index={index} count={items.length} onMove={(to) => moveItem(index, to)} onInsert={() => addItemAt(index)} onRemove={() => removeItem(index)} />
            </div>
            <FieldWrapper>
              <EditableText label={t('projectName')} value={item.name} onChange={(v) => updateItem(index, { name: v })} />
              <EditableText label={t('website')} value={item.url || ''} onChange={(v) => updateItem(index, { url: v })} />
            </FieldWrapper>
            <FieldWrapper>
              <EditableDate label={t('startDate')} value={item.startDate || ''} onChange={(v) => updateItem(index, { startDate: v })} />
              <EditableDate label={t('endDate')} value={item.endDate || ''} onChange={(v) => updateItem(index, { endDate: v })} />
            </FieldWrapper>
            <EditableRichText
              label={t('description')}
              value={item.description}
              onChange={(v) => updateItem(index, { description: v })}
              aiContext={{ sectionId: section.id, sectionTitle: section.title, item: item.name }}
            />
            <EditableList label={t('technologies')} items={item.technologies} onChange={(v) => updateItem(index, { technologies: v })} />
            <EditableList
              label={t('highlights')}
              items={item.highlights}
              onChange={(v) => updateItem(index, { highlights: v })}
              aiContext={{ sectionId: section.id, sectionTitle: section.title, item: item.name }}
            />
          </div>
        </div>
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
