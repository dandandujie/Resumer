'use client';

import { useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InlineFormatButtons, formatSelection } from './inline-format-buttons';
import { SortableList } from '../dnd/sortable-item';

interface EditableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

function FormattedInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 min-w-0 text-sm"
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
}: EditableListProps) {
  const t = useTranslations('common');
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

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--whale-ink-muted)]">
        {label}
      </label>
      <SortableList
        items={values.map((_, index) => `list-${index}`)}
        onMove={moveItem}
      >
        {(_, index) => (
          <div className="flex min-w-0 items-center gap-1">
            <FormattedInput
              value={values[index]}
              onChange={(value) => updateItem(index, value)}
              placeholder={placeholder}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-[var(--whale-ink-muted)] hover:text-red-500"
              onClick={() => removeItem(index)}
              aria-label="删除"
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
