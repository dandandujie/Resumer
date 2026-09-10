'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { cn } from '@/lib/utils';

type Props = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'onKeyDown'> & {
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** 回车时触发（单行语义下回车不换行；列表行用它新增下一条） */
  onEnter?: () => void;
};

const COLLAPSED_HEIGHT = 32;

/**
 * 单行语义的输入框：失焦时只占一行，聚焦或内容变长时按内容自动增高，
 * 让长句在编辑时完整可见，而不是在 32px 的框里左右滚。
 */
export const AutoGrowInput = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowInput(
  { className, onChange, onEnter, onFocus, onBlur, value, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);

  const grow = useCallback(() => {
    const element = inner.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(COLLAPSED_HEIGHT, element.scrollHeight)}px`;
  }, []);
  const collapse = useCallback(() => {
    if (inner.current) inner.current.style.height = `${COLLAPSED_HEIGHT}px`;
  }, []);

  return (
    <textarea
      ref={inner}
      rows={1}
      value={value}
      onChange={(event) => {
        onChange(event);
        grow();
      }}
      onFocus={(event) => {
        grow();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        collapse();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter?.();
        }
      }}
      style={{ height: COLLAPSED_HEIGHT }}
      className={cn(
        'flex w-full min-w-0 resize-none overflow-hidden rounded-md border border-input bg-transparent px-3 py-1.5',
        'text-sm leading-5 shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});
