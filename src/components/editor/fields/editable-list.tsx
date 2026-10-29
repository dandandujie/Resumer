'use client';

import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RichTextInput } from './rich-text-input';
import { Button } from '@/components/ui/button';
import { SortableList } from '../dnd/sortable-item';
import { AiRewriteMenu, type AiRewriteContext } from './ai-rewrite-menu';

interface EditableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  /** 字段路径（如 'highlights'），第 i 行上报为 'highlights.i'，用于和预览联动 */
  field?: string;
  /** 传了就给每一行一个「AI 改写这一条」菜单；技能/技术栈这类列表不传。 */
  aiContext?: Omit<AiRewriteContext, 'field'>;
}

export function EditableList({
  label,
  items,
  onChange,
  placeholder,
  field,
  aiContext,
}: EditableListProps) {
  const t = useTranslations('common');
  const tItems = useTranslations('editor.items');
  const listRef = useRef<HTMLDivElement>(null);
  const values = items || [];
  const updateItem = (index: number, value: string) =>
    onChange(values.map((item, i) => (i === index ? value : item)));
  const removeItem = (index: number) =>
    onChange(values.filter((_, i) => i !== index));
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= values.length) return;
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const focusRow = (index: number) =>
    requestAnimationFrame(() => {
      listRef.current?.querySelectorAll<HTMLElement>('[data-row-input]')[index]?.focus();
    });
  const addItem = () => {
    onChange([...values, '']);
    focusRow(values.length);
  };
  // 行内回车 = 在下一行新增一条，光标跟过去
  const insertAfter = (index: number) => {
    onChange([...values.slice(0, index + 1), '', ...values.slice(index + 1)]);
    focusRow(index + 1);
  };

  return (
    <div className="space-y-1.5" ref={listRef}>
      <span className="block text-xs font-medium text-[var(--whale-ink-muted)]">{label}</span>
      <div className="space-y-1.5">
        <SortableList items={values.map((_, index) => `list-${index}`)} onMove={moveItem}>
          {(_, index) => (
            <div className="group/row flex min-w-0 items-start gap-1">
              <div className="min-w-0 flex-1">
                <RichTextInput
                  value={values[index]}
                  onChange={(value) => updateItem(index, value)}
                  onEnter={() => insertAfter(index)}
                  placeholder={placeholder}
                  ariaLabel={`${label} ${index + 1}`}
                  field={field && `${field}.${index}`}
                />
              </div>
              {aiContext && (
                <div className="pt-1">
                  <AiRewriteMenu text={values[index]} context={{ ...aiContext, field: label }} />
                </div>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className="mt-1.5 shrink-0 cursor-pointer text-[var(--whale-ink-muted)] opacity-60 transition-opacity hover:text-red-500 group-hover/row:opacity-100"
                onClick={() => removeItem(index)}
                aria-label={tItems('removeItem')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </SortableList>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={addItem}
        className="h-7 cursor-pointer gap-1 px-2 text-xs text-[var(--whale-ink-muted)] hover:text-[var(--whale-ink)]"
      >
        <Plus className="h-3 w-3" />
        {t('add')}
      </Button>
    </div>
  );
}
