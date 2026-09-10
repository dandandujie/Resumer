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
import type {
  ResumeSection,
  WorkExperienceContent,
  WorkExperienceItem,
} from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<WorkExperienceContent>) => void;
}

export function WorkExperienceSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as WorkExperienceContent;
  const items = content.items || [];
  const aiContext = (item: WorkExperienceItem) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    item: [item.company, item.position].filter(Boolean).join(' · '),
  });

  const createItem = (): WorkExperienceItem => {
    const newItem: WorkExperienceItem = {
      id: generateId(),
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: null,
      current: false,
      description: '',
      technologies: [],
      highlights: [],
    };
    return newItem;
  };

  const addItemAt = (index = items.length) =>
    onUpdate({
      items: [...items.slice(0, index), createItem(), ...items.slice(index)],
    } as any);
  const addItem = () => addItemAt();
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const updated = [...items];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    onUpdate({ items: updated } as any);
  };

  const updateItem = (index: number, data: Partial<WorkExperienceItem>) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, ...data } : item,
    );
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      <SortableList
        items={items.map((item, index) => item.id || `we-${index}`)}
        onMove={moveItem}
      >
        {(_, index) => {
          const item = items[index];
          return (
            <div key={item.id || `we-${index}`}>
              {index > 0 && <Separator className="mb-4" />}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    #{index + 1}
                  </span>
                  <SortableItemActions
                    index={index}
                    count={items.length}
                    onMove={(to) => moveItem(index, to)}
                    onInsert={() => addItemAt(index)}
                    onRemove={() => removeItem(index)}
                  />
                </div>
                <FieldWrapper>
                  <EditableText
                    label={t('company')}
                    value={item.company}
                    onChange={(v) => updateItem(index, { company: v })}
                  />
                  <EditableText
                    label={t('position')}
                    value={item.position}
                    onChange={(v) => updateItem(index, { position: v })}
                  />
                </FieldWrapper>
                <FieldWrapper>
                  <EditableDate
                    label={t('startDate')}
                    value={item.startDate}
                    onChange={(v) => updateItem(index, { startDate: v })}
                  />
                  <EditableDate
                    label={t('endDate')}
                    value={item.endDate || ''}
                    current={item.current}
                    allowCurrent
                    onCurrentChange={(current) =>
                      updateItem(index, {
                        current,
                        endDate: current ? null : item.endDate,
                      })
                    }
                    onChange={(v) =>
                      updateItem(index, { endDate: v || null, current: false })
                    }
                  />
                </FieldWrapper>
                <EditableRichText
                  label={t('description')}
                  value={item.description}
                  onChange={(v) => updateItem(index, { description: v })}
                  aiContext={aiContext(item)}
                />
                <EditableList
                  label={t('technologies')}
                  items={item.technologies || []}
                  onChange={(v) => updateItem(index, { technologies: v })}
                />
                <EditableList
                  label={t('highlights')}
                  items={item.highlights}
                  onChange={(v) => updateItem(index, { highlights: v })}
                  aiContext={aiContext(item)}
                />
              </div>
            </div>
          );
        }}
      </SortableList>
      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        className="w-full cursor-pointer gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
