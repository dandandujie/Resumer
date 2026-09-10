'use client';

import { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export interface SortableHandleProps {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
}

interface SortableItemProps {
  id: string;
  showHandle?: boolean;
  children:
    | React.ReactNode
    | ((handle: SortableHandleProps) => React.ReactNode);
}

export function SortableItem({ id, showHandle = true, children }: SortableItemProps) {
  const t = useTranslations('editor.items');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const content =
    typeof children === 'function'
      ? children({ attributes, listeners })
      : children;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-start gap-1"
    >
      {showHandle && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={t('drag')}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="min-w-0 flex-1">{content}</div>
    </div>
  );
}

interface SortableListProps {
  items: string[];
  onMove: (from: number, to: number) => void;
  /** 为 true 时由子组件自己放拖柄（条目卡把它放进标题栏），列表不再在左侧渲染拖柄。 */
  ownHandle?: boolean;
  children: (id: string, index: number, handle: SortableHandleProps) => React.ReactNode;
}

export function SortableList({ items, onMove, ownHandle = false, children }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const itemIds = useMemo(
    () => items.map((id, index) => id || `item-${index}`),
    [items],
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = itemIds.indexOf(String(active.id));
    const to = itemIds.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {itemIds.map((id, index) => (
          <SortableItem key={id} id={id} showHandle={!ownHandle}>
            {(handle: SortableHandleProps) => children(id, index, handle)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

interface SortableItemActionsProps {
  index: number;
  count: number;
  handle?: SortableHandleProps;
  onMove: (to: number) => void;
  onInsert: () => void;
  onRemove: () => void;
}

export function SortableItemActions({
  index,
  count,
  handle,
  onMove,
  onInsert,
  onRemove,
}: SortableItemActionsProps) {
  const t = useTranslations('editor.items');
  const iconClass = 'h-3.5 w-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {handle && (
        <button
          type="button"
          {...handle.attributes}
          {...handle.listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={t('drag')}
        >
          <GripVertical className={iconClass} />
        </button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        aria-label={t('moveUp')}
      >
        <ArrowUp className={iconClass} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label={t('moveDown')}
      >
        <ArrowDown className={iconClass} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onInsert}
        aria-label={t('insertAbove')}
      >
        <Plus className={iconClass} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-red-500"
        onClick={onRemove}
        aria-label={t('remove')}
      >
        ×
      </Button>
    </div>
  );
}
