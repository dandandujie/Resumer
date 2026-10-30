'use client';

import { RichTextInput } from './rich-text-input';

interface EditableTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 只影响键盘类型提示；输入框本身是单行语义的自增高文本域 */
  type?: string;
  /** 字段路径，用于和预览联动 */
  field?: string;
}

export function EditableText({ label, value, onChange, placeholder, type = 'text', field }: EditableTextProps) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-xs font-medium text-[var(--app-text-muted)]">{label}</span>
      <RichTextInput
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder || label}
        ariaLabel={label}
        inputMode={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined}
        field={field}
        collapseOnBlur
      />
    </label>
  );
}
