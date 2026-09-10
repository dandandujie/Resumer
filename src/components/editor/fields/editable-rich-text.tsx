'use client';

import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { InlineFormatButtons, formatSelection } from './inline-format-buttons';
import { AiRewriteMenu, type AiRewriteContext } from './ai-rewrite-menu';
import { SelectionFormatBar } from './selection-format-bar';

interface EditableRichTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** 传了就在标签行显示「AI 改写这一条」菜单。 */
  aiContext?: Omit<AiRewriteContext, 'field'>;
}

export function EditableRichText({ label, value, onChange, placeholder, rows = 3, aiContext }: EditableRichTextProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--whale-ink-muted)]">{label}</label>
        <div className="flex items-center gap-0.5">
          <InlineFormatButtons
            onFormat={(marker) => {
              if (inputRef.current) formatSelection(inputRef.current, marker, onChange);
            }}
          />
          {aiContext && <AiRewriteMenu text={value || ''} context={{ ...aiContext, field: label }} />}
        </div>
      </div>
      <div className="relative">
        <SelectionFormatBar inputRef={inputRef} onChange={onChange} />
        <Textarea
          ref={inputRef}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || label}
          rows={rows}
          className="resize-none text-sm"
        />
      </div>
    </div>
  );
}
