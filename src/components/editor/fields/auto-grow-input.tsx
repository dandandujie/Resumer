'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useActiveFieldReporter } from './field-scope';

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'onKeyDown'> & {
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** 回车时触发（单行语义下回车不换行；列表行用它新增下一条） */
  onEnter?: () => void;
  /** 字段路径，用于和预览联动 */
  field?: string;
};

/**
 * 单行语义的输入框：回车不换行，但内容多长框就多高——失焦也不折叠，长句始终完整可见。
 */
export const AutoGrowInput = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowInput(
  { className, onChange, onEnter, onFocus, onBlur, onSelect, value, field, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const reporter = useActiveFieldReporter(field);

  useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    const fit = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
    };
    fit();
    // 宽度变化（拖动分栏、窗口缩放）会改变折行，重新量一次
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  const report = () => {
    const element = inner.current;
    if (element) reporter?.report(element.value, element.selectionStart ?? 0, element.selectionEnd ?? 0);
  };

  return (
    <textarea
      ref={inner}
      rows={1}
      value={value}
      onChange={(event) => {
        onChange(event);
        report();
      }}
      onFocus={(event) => {
        report();
        onFocus?.(event);
      }}
      onSelect={(event) => {
        report();
        onSelect?.(event);
      }}
      onBlur={(event) => {
        reporter?.clear();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter?.();
        }
      }}
      data-row-input=""
      className={cn(
        'block w-full min-w-0 resize-none overflow-hidden rounded-md border border-input bg-[var(--app-surface)] px-3 py-1.5',
        'text-sm leading-6 text-[var(--app-text)] shadow-xs outline-none transition-[border-color,box-shadow]',
        'placeholder:text-[var(--app-text-muted)]/70 hover:border-[var(--app-text)]/25',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});
