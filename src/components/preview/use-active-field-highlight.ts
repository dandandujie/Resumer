'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore, type ActiveField } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';

const HIGHLIGHT_NAME = 'resume-editing-selection';
const EDITING_ATTR = 'data-editing';

/** 找到预览里对应的字段元素；'highlights.2' 找不到单独一行时退回整个列表（如技术栈渲染成一行逗号串）。 */
function findFieldElement(root: HTMLElement, field: ActiveField): HTMLElement | null {
  const section = root.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(field.sectionId)}"]`);
  const scope = field.itemId
    ? section?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(field.itemId)}"]`)
    : section;
  if (!scope) return null;
  for (const key of [field.field, field.field.replace(/\.\d+$/, '')]) {
    const element = scope.querySelector<HTMLElement>(`[data-field~="${CSS.escape(key)}"]`);
    if (element) return element;
  }
  return null;
}

/**
 * 预览文字是字段纯文本去掉换行、列表符号与行首尾空白后的子序列：
 * 顺序贪心对齐，把右栏的选区偏移换成预览里的 DOM 区间。
 */
function selectionRange(element: HTMLElement, text: string, start: number, end: number): Range | null {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  if (!nodes.length) return null;

  let index = 0;
  let offset = 0;
  let from: [Text, number] | null = null;
  for (let i = 0; i <= end; i += 1) {
    while (index < nodes.length - 1 && offset >= nodes[index].data.length) {
      index += 1;
      offset = 0;
    }
    const point: [Text, number] = [nodes[index], Math.min(offset, nodes[index].data.length)];
    if (i === start) from = point;
    if (i === end) {
      if (!from) return null;
      const range = document.createRange();
      range.setStart(...from);
      range.setEnd(...point);
      return range;
    }
    if (nodes[index].data[offset] === text[i]) offset += 1;
  }
  return null;
}

/** 把右栏正在编辑的字段在预览里描出来，选中的字用高亮底色标出；换字段时滚到可见处。 */
export function useActiveFieldHighlight(containerRef: React.RefObject<HTMLElement | null>) {
  const activeField = useEditorStore((s) => s.activeField);
  const sections = useResumeStore((s) => s.sections);
  const template = useResumeStore((s) => s.currentResume?.template);
  const lastFieldKey = useRef('');

  useEffect(() => {
    const root = containerRef.current;
    if (!activeField) lastFieldKey.current = '';
    if (!root || !activeField) return;
    const element = findFieldElement(root, activeField);
    if (!element) return;

    element.setAttribute(EDITING_ATTR, '');
    const fieldKey = `${activeField.sectionId}/${activeField.itemId}/${activeField.field}`;
    if (fieldKey !== lastFieldKey.current) {
      lastFieldKey.current = fieldKey;
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // 一个元素只承载这一个字段时才能逐字对齐；合并显示的（如"学校 - 专业 - 学位"）只描整块
    const registry = CSS.highlights;
    const refresh = () => {
      registry?.delete(HIGHLIGHT_NAME);
      const current = findFieldElement(root, activeField);
      if (!current) return;
      current.setAttribute(EDITING_ATTR, '');
      if (registry && current.dataset.field === activeField.field && activeField.end > activeField.start) {
        const range = selectionRange(current, activeField.text, activeField.start, activeField.end);
        if (range) registry.set(HIGHLIGHT_NAME, new Highlight(range));
      }
    };
    refresh();
    // React 重建正文 DOM、分页预估重绘时，Range 会自动塌缩；按实际文本更新重建，
    // 只观察内容，不观察描边属性，避免自身触发循环。
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      element.removeAttribute(EDITING_ATTR);
      root.querySelectorAll(`[${EDITING_ATTR}]`).forEach((node) => node.removeAttribute(EDITING_ATTR));
      registry?.delete(HIGHLIGHT_NAME);
    };
  }, [activeField, sections, template, containerRef]);
}
