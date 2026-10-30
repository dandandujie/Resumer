'use client';

import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichTextInput } from './rich-text-input';
import { parseInline, plainText, replaceText, serializeInline } from '@/lib/resume-text';

interface EditableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  /** 字段路径，用于和预览联动 */
  field?: string;
}

export function EditableSelect({ label, value, onChange, options, placeholder, field }: EditableSelectProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-xs font-medium text-[var(--app-text-muted)]">{label}</span>
      <div className="relative flex items-start gap-1">
        <RichTextInput value={value || ''} onChange={onChange} field={field} ariaLabel={label} placeholder={placeholder || label} collapseOnBlur />
        <Select value={plainText(value || '')} onValueChange={(next) => onChange(serializeInline(replaceText(parseInline(value || ''), 0, plainText(value || '').length, next)))}>
          <SelectTrigger
            aria-label={label}
            className="h-9 w-9 shrink-0 justify-center bg-[var(--app-surface)] px-2 text-sm"
          >
            <span className="sr-only"><SelectValue placeholder={placeholder || label} /></span>
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            aria-label={`${label} ×`}
            className="mt-2 cursor-pointer rounded p-0.5 text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)]"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
