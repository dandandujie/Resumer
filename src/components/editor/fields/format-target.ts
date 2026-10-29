import { create } from 'zustand';
import type { InlineStyle } from '@/lib/resume-text';

/**
 * 当前获得焦点的富文本字段对外暴露的格式操作。顶部格式栏与选区旁的浮动工具条
 * 都通过它操作同一个字段，所以两处按钮的按下态、字体字号永远一致。
 */
export interface FormatTarget {
  id: string;
  /** 选区（或光标处接下来要输入的文字）统一的样式 */
  style: InlineStyle;
  hasSelection: boolean;
  paragraph?: boolean;
  apply: (patch: InlineStyle) => void;
  clear: () => void;
  focus: () => void;
}

interface FormatTargetStore {
  target: FormatTarget | null;
  setTarget: (target: FormatTarget) => void;
  release: (id: string) => void;
}

export const useFormatTarget = create<FormatTargetStore>((set, get) => ({
  target: null,
  setTarget: (target) => set({ target }),
  release: (id) => {
    if (get().target?.id === id) set({ target: null });
  },
}));

/** 格式栏、浮动工具条的根节点带这个属性：焦点移到它们上面时，字段不算失焦。 */
export const FORMAT_UI_ATTR = 'data-format-ui';

export function isFormatUi(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest(`[${FORMAT_UI_ATTR}]`) !== null;
}
