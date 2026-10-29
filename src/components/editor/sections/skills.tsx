'use client';

import { useTranslations } from 'next-intl';
import { FieldScopeProvider } from '../fields/field-scope';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { TagListInput } from '../fields/tag-list-input';
import { generateId } from '@/lib/utils';
import { SortableItemActions, SortableList } from '../dnd/sortable-item';
import type { ResumeSection, SkillsContent, SkillCategory } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<SkillsContent>) => void;
}

export function SkillsSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as SkillsContent;
  const categories = content.categories || [];

  const createCategory = (): SkillCategory => {
    const newCategory: SkillCategory = {
      id: generateId(),
      name: '',
      skills: [],
    };
    return newCategory;
  };
  const addCategoryAt = (index = categories.length) => onUpdate({ categories: [...categories.slice(0, index), createCategory(), ...categories.slice(index)] } as any);
  const addCategory = () => addCategoryAt();
  const moveCategory = (from: number, to: number) => {
    if (to < 0 || to >= categories.length) return;
    const updated = [...categories]; const [category] = updated.splice(from, 1); updated.splice(to, 0, category); onUpdate({ categories: updated } as any);
  };

  const updateCategory = (index: number, data: Partial<SkillCategory>) => {
    const updated = categories.map((cat, i) => (i === index ? { ...cat, ...data } : cat));
    onUpdate({ categories: updated } as any);
  };

  const removeCategory = (index: number) => {
    onUpdate({ categories: categories.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      <SortableList items={categories.map((cat, index) => cat.id || `cat-${index}-${cat.name}`)} onMove={moveCategory}>
        {(_, index) => { const cat = categories[index]; return (
        <FieldScopeProvider key={cat.id || `cat-${index}-${cat.name}`} sectionId={section.id} itemId={cat.id}>
        <div data-editor-item-id={cat.id}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <EditableText field="name" label={t('skillCategory')} value={cat.name} onChange={(v) => updateCategory(index, { name: v })} />
              <SortableItemActions index={index} count={categories.length} onMove={(to) => moveCategory(index, to)} onInsert={() => addCategoryAt(index)} onRemove={() => removeCategory(index)} />
            </div>
            <TagListInput field="skills" label={t('technologies')} items={cat.skills} onChange={(v) => updateCategory(index, { skills: v })} />
          </div>
        </div>
        </FieldScopeProvider>
        ); }}
      </SortableList>
      <Button variant="outline" size="sm" onClick={addCategory} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
