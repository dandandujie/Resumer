'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

interface ItemBoxProps {
  sectionId: string;
  itemId: string;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * 预览里的一条经历/项目/教育。交互态下与右栏的活动条目双向联动：
 * 右栏在编辑哪条，这里就高亮哪条并滚到可见；点这里则让右栏展开并滚到对应卡片。
 */
export function ItemBox({ sectionId, itemId, interactive, className, children }: ItemBoxProps) {
  const isActive = useEditorStore((s) => Boolean(interactive) && s.activeItem?.sectionId === sectionId && s.activeItem.itemId === itemId);
  const setActiveItem = useEditorStore((s) => s.setActiveItem);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isActive]);

  if (!interactive) {
    return (
      <div className={cn('item', className)} data-item-id={itemId}>
        {children}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      data-item-id={itemId}
      onClick={() => setActiveItem({ sectionId, itemId })}
      className={cn(
        'item -mx-1 rounded px-1 transition-shadow',
        isActive ? 'ring-1 ring-[var(--app-accent)]/70 bg-[var(--app-accent-soft)]/10' : 'hover:ring-1 hover:ring-[var(--app-border)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
