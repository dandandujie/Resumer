import { memo } from 'react';
import { md } from '@/lib/resume-text';

/** 稳定的文本节点避免无关的父组件更新反复重建 innerHTML，保留浏览器选区。 */
export const InlineText = memo(function InlineText({ children, field }: { children: unknown; field?: string }) {
  return <span data-inline-text="" data-field={field} dangerouslySetInnerHTML={{ __html: md(children) }} />;
});
