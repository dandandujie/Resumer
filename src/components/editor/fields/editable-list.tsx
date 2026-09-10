'use client';

import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AutoGrowInput } from './auto-grow-input';
import { Button } from '@/components/ui/button';
import { InlineFormatButtons, formatSelection } from './inline-format-buttons';
import { SortableList } from '../dnd/sortable-item';
import { AiRewriteMenu, type AiRewriteContext } from './ai-rewrite-menu';
import { SelectionFormatBar } from './selection-format-bar';

interface EditableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  /** 传了就给每一行一个「AI 改写这一条」菜单；技能/技术栈这类列表不传。 */
  aiContext?: Omit<AiRewriteContext, 'field'>;
}

function FormattedInput({
  value,
  placeholder,
  onChange,
  onEnter,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="relative flex min-w-0 flex-1 items-start gap-1">
      <SelectionFormatBar inputRef={inputRef} onChange={onChange} />
      <AutoGrowInput
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onEnter={onEnter}
        placeholder={placeholder}
      />
      <InlineFormatButtons
        onFormat={(marker) => {
          if (inputRef.current)
            formatSelection(inputRef.current, marker, onChange);
        }}
      />
    </div>
  );
}

export function EditableList({
  label,
  items,
  onChange,
  placeholder,
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
  const addItem = () => onChange([...values, '']);
  // 行内回车 = 在下一行新增一条，光标跟过去
  const insertAfter = (index: number) => {
    onChange([...values.slice(0, index + 1), '', ...values.slice(index + 1)]);
    requestAnimationFrame(() => {
      const rows = listRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea');
      rows?.[index + 1]?.focus();
    });
  };

  return (
    <div className="space-y-1" ref={listRef}>
      <label className="text-xs font-medium text-[var(--whale-ink-muted)]">
        {label}
      </label>
      <SortableList
        items={values.map((_, index) => `list-${index}`)}
        onMove={moveItem}
      >
        {(_, index) => (
          <div className="flex min-w-0 items-start gap-1">
            <FormattedInput
              value={values[index]}
              onChange={(value) => updateItem(index, value)}
              onEnter={() => insertAfter(index)}
              placeholder={placeholder}
            />
            {aiContext && <AiRewriteMenu text={values[index]} context={{ ...aiContext, field: label }} />}
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-[var(--whale-ink-muted)] hover:text-red-500"
              onClick={() => removeItem(index)}
              aria-label={tItems('removeItem')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </SortableList>
      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        className="h-7 cursor-pointer gap-1 text-xs"
      >
        <Plus className="h-3 w-3" />
        {t('add')}
      </Button>
    </div>
  );
}
