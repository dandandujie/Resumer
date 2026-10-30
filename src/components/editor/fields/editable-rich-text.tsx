'use client';

import { RichTextInput } from './rich-text-input';
import { AiRewriteMenu, type AiRewriteContext } from './ai-rewrite-menu';

interface EditableRichTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 字段路径，用于和预览联动 */
  field?: string;
  /** 传了就在标签行显示「AI 改写这一条」菜单。 */
  aiContext?: Omit<AiRewriteContext, 'field'>;
}

export function EditableRichText({ label, value, onChange, placeholder, field, aiContext }: EditableRichTextProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--app-text-muted)]">{label}</span>
        {aiContext && <AiRewriteMenu text={value || ''} context={{ ...aiContext, field: label }} />}
      </div>
      <RichTextInput
        multiline
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder || label}
        ariaLabel={label}
        field={field}
      />
    </div>
  );
}
