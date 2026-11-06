import type { ResumeSection, ThemeConfig } from './resume';

export interface EditorState {
  selectedSectionId: string | null;
  selectedItemId: string | null;
  isDragging: boolean;
  showAiChat: boolean;
  zoom: number;
}

export interface ResumeSnapshot {
  sections: ResumeSection[];
  // Captured alongside sections so visual-only operations (e.g. smart layout,
  // which only mutates the theme) can be undone/redone too.
  themeConfig?: ThemeConfig;
  template?: string;
  timestamp: number;
}

export type DragItemType = 'section' | 'item' | 'new-section';

export interface DragData {
  type: DragItemType;
  sectionId?: string;
  itemId?: string;
  sectionType?: string;
}
