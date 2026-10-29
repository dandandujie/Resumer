'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RichTextInput } from './rich-text-input';
import { plainText } from '@/lib/resume-text';
import { cn } from '@/lib/utils';
import { useActiveFieldReporter } from './field-scope';

/** 逗号（中英文）、顿号、分号、换行都当分隔符：粘贴一串技术栈会自动拆成多个标签。 */
const SEPARATORS = /[,，、;；\n]+/;
const DRAG_DISTANCE_PX = 4;

function splitTags(text: string): string[] {
  return text.split(SEPARATORS).map((part) => part.trim()).filter(Boolean);
}

function Chip({
  id,
  label,
  field,
  ariaLabel,
  onChange,
  onRemove,
  removeLabel,
}: {
  id: string;
  label: string;
  field?: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group/chip inline-flex max-w-full cursor-grab items-center gap-0.5 rounded-md border py-0.5 pl-2 pr-0.5 text-[13px] leading-5 active:cursor-grabbing',
        'border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] text-[var(--whale-ink)] hover:border-[var(--whale-ink)]/25',
        isDragging && 'z-10 shadow-md',
      )}
    >
      <button type="button" {...attributes} {...listeners} aria-label={ariaLabel + ' ↕'} className="cursor-grab px-0.5 text-[var(--whale-ink-muted)]"><GripVertical className="h-3 w-3" /></button>
      <RichTextInput value={label} onChange={onChange} field={field} ariaLabel={ariaLabel} className="w-auto min-w-[3rem] min-h-6 border-0 bg-transparent px-1 py-0 text-[13px] shadow-none" />
      <button
        type="button"
        aria-label={`${removeLabel} ${plainText(label)}`}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--whale-ink-muted)] opacity-60 hover:bg-[var(--whale-cream-deep)] hover:text-red-600 hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

interface TagListInputProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  /** 字段路径，用于和预览联动 */
  field?: string;
}

/**
 * 技术栈、技能这类短词列表：标签式输入。回车或逗号成标签，粘贴一串自动拆分；
 * 标签内可直接改字、设置格式；空输入框退格时聚焦最后一个标签，保留其格式。
 */
export function TagListInput({ label, items, onChange, placeholder, field }: TagListInputProps) {
  const t = useTranslations('editor.items');
  const values = items || [];
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const reporter = useActiveFieldReporter(field);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }));
  const ids = values.map((_, index) => `tag-${index}`);

  const commit = (text: string) => {
    const parts = splitTags(text);
    if (parts.length) {
      onChange([...values, ...parts]);
    }
    setDraft('');
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    const next = [...values];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div ref={containerRef} className="min-w-0 space-y-1.5">
      <span className="block text-xs font-medium text-[var(--whale-ink-muted)]">{label}</span>
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
        className={cn(
          'flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-[var(--whale-card)] px-2 py-1.5 shadow-xs',
          'transition-[border-color,box-shadow] hover:border-[var(--whale-ink)]/25',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25',
        )}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            {values.map((value, index) => (
              <Chip
                key={ids[index]}
                id={ids[index]}
                label={value}
                field={field && `${field}.${index}`}
                ariaLabel={`${label} ${index + 1}`}
                onChange={(next) => onChange(values.map((item, i) => i === index ? next : item))}
                onRemove={() => {
                  onChange(values.filter((_, i) => i !== index));
                }}
                removeLabel={t('removeItem')}
              />
            ))}
          </SortableContext>
        </DndContext>
        <input
          ref={inputRef}
          value={draft}
          aria-label={label}
          placeholder={values.length ? '' : placeholder || label}
          onChange={(event) => {
            const text = event.target.value;
            // 输入了分隔符就立刻成标签（输入法上屏的中文逗号同样生效）
            if (!composing.current && SEPARATORS.test(text)) commit(text);
            else setDraft(text);
          }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(event) => { composing.current = false; const text = event.currentTarget.value; if (SEPARATORS.test(text)) commit(text); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && !draft && values.length) {
              event.preventDefault();
              const inputs = containerRef.current?.querySelectorAll<HTMLElement>('[contenteditable="true"]');
              const last = inputs?.[inputs.length - 1];
              if (last) {
                last.focus();
                const range = document.createRange();
                range.selectNodeContents(last);
                range.collapse(false);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
              }
            }
          }}
          onFocus={() => reporter?.report(values.join(', '), 0, 0)}
          onBlur={() => {
            reporter?.clear();
            if (draft.trim()) commit(draft);
          }}
          className="h-6 min-w-[6rem] flex-1 bg-transparent px-1 text-sm text-[var(--whale-ink)] outline-none placeholder:text-[var(--whale-ink-muted)]/70"
        />
      </div>
    </div>
  );
}
