'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { SortableItemActions, type SortableHandleProps } from '../dnd/sortable-item';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

interface ItemCardProps {
  sectionId: string;
  itemId: string;
  index: number;
  count: number;
  /** 折叠时标题栏显示的摘要（公司 · 职位 / 学校 / 项目名） */
  title: string;
  subtitle?: string;
  handle: SortableHandleProps;
  onMove: (to: number) => void;
  onInsert: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

/**
 * 右栏的条目卡片：标题栏带拖柄 / 序号 / 摘要 / 上下移 / 插入 / 删除，正文可折叠。
 * 同一模块只展开"活动条目"（store.activeItem），其余折叠成一行，长列表也能一眼看清顺序。
 * 没有活动条目时默认展开第一条；正文里任何输入框获得焦点都会把这条设为活动条目。
 */
export function ItemCard({
  sectionId,
  itemId,
  index,
  count,
  title,
  subtitle,
  handle,
  onMove,
  onInsert,
  onRemove,
  children,
}: ItemCardProps) {
  const t = useTranslations('editor.items');
  const activeItem = useEditorStore((s) => s.activeItem);
  const setActiveItem = useEditorStore((s) => s.setActiveItem);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = activeItem?.sectionId === sectionId && activeItem.itemId === itemId;
  const expanded = activeItem?.sectionId === sectionId ? isActive : index === 0;

  // 从预览点过来时把这条卡片滚到可见处
  useEffect(() => {
    if (isActive) rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isActive]);

  const activate = () => setActiveItem({ sectionId, itemId });
  const toggle = () => setActiveItem({ sectionId, itemId: expanded ? null : itemId });

  return (
    <div
      ref={rootRef}
      data-editor-item-id={itemId}
      className={cn(
        'rounded-lg border bg-[var(--whale-card)] transition-colors',
        isActive ? 'border-[var(--whale-mint-deep)]/60 shadow-sm' : 'border-[var(--whale-divider)]',
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !expanded && '-rotate-90')} />
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">#{index + 1}</span>
          <span className={cn('truncate text-xs', title ? 'font-medium text-[var(--whale-ink)]' : 'text-muted-foreground')}>
            {title || t('untitled')}
          </span>
          {subtitle && <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>}
        </button>
        <SortableItemActions
          index={index}
          count={count}
          handle={handle}
          onMove={onMove}
          onInsert={onInsert}
          onRemove={onRemove}
        />
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-[var(--whale-divider)] p-3" onFocusCapture={activate}>
          {children}
        </div>
      )}
    </div>
  );
}
