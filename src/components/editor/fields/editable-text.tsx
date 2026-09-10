'use client';

import { AutoGrowInput } from './auto-grow-input';

interface EditableTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 只影响键盘类型提示；输入框本身是单行语义的自增高文本域 */
  type?: string;
}

export function EditableText({ label, value, onChange, placeholder, type = 'text' }: EditableTextProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--whale-ink-muted)]">{label}</label>
      <AutoGrowInput
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
        inputMode={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined}
      />
    </div>
  );
}
