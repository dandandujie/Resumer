'use client';

import { createContext, useContext, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';

interface FieldScope {
  sectionId: string;
  itemId: string | null;
}

const FieldScopeContext = createContext<FieldScope | null>(null);

/** 模块卡（itemId 为 null）与条目卡各提供一层作用域，字段只需声明自己的路径。 */
export function FieldScopeProvider({ sectionId, itemId, children }: FieldScope & { children: React.ReactNode }) {
  const scope = useMemo(() => ({ sectionId, itemId }), [sectionId, itemId]);
  return <FieldScopeContext.Provider value={scope}>{children}</FieldScopeContext.Provider>;
}

export interface ActiveFieldReporter {
  report: (text: string, start: number, end: number) => void;
  clear: () => void;
}

/**
 * 字段向预览报告"正在编辑哪里、选中了哪几个字"。
 * 没有 field 或不在模块作用域里（比如对话框里的输入框）时返回 null，不参与联动。
 */
export function useActiveFieldReporter(field?: string): ActiveFieldReporter | null {
  const scope = useContext(FieldScopeContext);
  return useMemo(() => {
    if (!scope || !field) return null;
    const { setActiveField } = useEditorStore.getState();
    return {
      report: (text, start, end) => setActiveField({ ...scope, field, text, start, end }),
      clear: () => {
        const current = useEditorStore.getState().activeField;
        const mine = current?.sectionId === scope.sectionId && current.itemId === scope.itemId && current.field === field;
        if (mine) setActiveField(null);
      },
    };
  }, [scope, field]);
}
