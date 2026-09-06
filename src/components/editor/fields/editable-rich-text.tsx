'use client';

import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { InlineFormatButtons, formatSelection } from './inline-format-buttons';

interface EditableRichTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function EditableRichText({ label, value, onChange, placeholder, rows = 3 }: EditableRichTextProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between"><label className="text-xs font-medium text-[var(--whale-ink-muted)]">{label}</label><InlineFormatButtons onFormat={(marker) => { if (inputRef.current) formatSelection(inputRef.current, marker, onChange); }} /></div>
      <Textarea
        ref={inputRef}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        rows={rows}
        className="resize-none text-sm"
      />
    </div>
  );
}
