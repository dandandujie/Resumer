import { create } from 'zustand';
import * as api from '@/lib/tauri-api';
import type { Resume, ResumeSection, SectionContent, ThemeConfig } from '@/types/resume';
import { AUTOSAVE_DELAY } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
import { useProposalsStore } from '@/stores/proposals-store';

interface ResumeStore {
  currentResume: Resume | null;
  sections: ResumeSection[];
  isDirty: boolean;
  isSaving: boolean;
  _saveTimeout: ReturnType<typeof setTimeout> | null;

  setResume: (resume: Resume) => void;
  updateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  updateSectionTitle: (sectionId: string, title: string) => void;
  updateThemeConfig: (config: Partial<ThemeConfig>) => void;
  addSection: (section: ResumeSection) => void;
  removeSection: (sectionId: string) => void;
  reorderSections: (sections: ResumeSection[]) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  setTitle: (title: string) => void;
  save: () => Promise<void>;
  flushPendingSave: () => Promise<void>;
  _scheduleSave: () => void;
  cancelAndWait: () => Promise<void>;
  reset: () => void;
}

let activeSave: Promise<void> | null = null;
let saveEpoch = 0;

export const useResumeStore = create<ResumeStore>((set, get) => ({
  currentResume: null,
  sections: [],
  isDirty: false,
  isSaving: false,
  _saveTimeout: null,

  setResume: (resume) => {
    // Cancel any pending autosave to prevent stale data overwriting server changes (e.g., from AI tool calls)
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    // Clear proposals that don't belong to this resume
    useProposalsStore.getState().scopeTo(resume.id);

    // Normalize: ensure all items/categories in section content have id fields
    const sections = (resume.sections || []).map((s) => {
      const content = s.content as unknown as Record<string, unknown>;
      if (Array.isArray(content?.items)) {
        content.items = (content.items as any[]).map((item) =>
          typeof item === 'object' && item !== null && !item.id
            ? { ...item, id: generateId() }
            : item
        );
      }
      if (Array.isArray(content?.categories)) {
        content.categories = (content.categories as any[]).map((cat) =>
          typeof cat === 'object' && cat !== null && !cat.id
            ? { ...cat, id: generateId() }
            : cat
        );
      }
      return { ...s, content: content as unknown as typeof s.content };
    });

    set({
      currentResume: { ...resume, sections },
      sections,
      isDirty: false,
      _saveTimeout: null,
    });
  },

  updateSection: (sectionId, content) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, content: { ...s.content, ...content } as SectionContent } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  updateSectionTitle: (sectionId, title) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, title } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  updateThemeConfig: (config) => {
    set((state) => {
      if (!state.currentResume) return state;
      return {
        currentResume: {
          ...state.currentResume,
          themeConfig: {
            ...state.currentResume.themeConfig,
            ...config,
          },
        },
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  addSection: (section) => {
    set((state) => {
      const sections = [...state.sections, section];
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  removeSection: (sectionId) => {
    set((state) => {
      const sections = state.sections.filter((s) => s.id !== sectionId);
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  reorderSections: (sections) => {
    set((state) => ({
      sections,
      currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  toggleSectionVisibility: (sectionId) => {
    set((state) => {
      const sections = state.sections.map((s) =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      );
      return {
        sections,
        currentResume: state.currentResume ? { ...state.currentResume, sections } : null,
        isDirty: true,
      };
    });
    get()._scheduleSave();
  },

  setTitle: (title) => {
    set((state) => ({
      currentResume: state.currentResume
        ? { ...state.currentResume, title }
        : null,
      isDirty: true,
    }));
    get()._scheduleSave();
  },

  save: async () => {
    if (activeSave) return activeSave;
    const { currentResume, sections, isDirty, _saveTimeout } = get();
    if (!currentResume || !isDirty) return;

    if (_saveTimeout) clearTimeout(_saveTimeout);
    set({ isSaving: true, _saveTimeout: null });
    const task = (async () => {
      try {
        const serializedSections = sections.map((s, i) => ({
          id: s.id,
          type: s.type,
          title: s.title,
          sortOrder: i,
          visible: s.visible,
          content: s.content,
        }));

        await api.updateResume(currentResume.id, {
          title: currentResume.title,
          language: currentResume.language,
          template: currentResume.template || 'classic',
          themeConfig: currentResume.themeConfig,
          sections: serializedSections,
        });

        // 保存期间的新输入仍是草稿，不能被旧请求清掉 dirty 标记。
        if (get().currentResume === currentResume && get().sections === sections) set({ isDirty: false });
      } catch (error) {
        console.error('Failed to save resume:', error);
        import('@/stores/error-log-store').then(({ logError }) => {
          logError('保存失败', '未能写入本机，草稿仍保留，请重试。' + String((error as Error)?.message || error));
        });
        throw error;
      } finally {
        set({ isSaving: false });
      }
    })();
    activeSave = task;
    try { await task; } finally { if (activeSave === task) activeSave = null; }
  },

  flushPendingSave: async () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      set({ _saveTimeout: null });
    }

    const epoch = saveEpoch;
    if (activeSave) await activeSave;
    const resumeId = get().currentResume?.id;
    while (get().isDirty && get().currentResume?.id === resumeId && epoch === saveEpoch) await get().save();
  },

  _scheduleSave: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);

    const { autoSave, autoSaveInterval, _hydrated } = useSettingsStore.getState();

    // If settings are hydrated and autoSave is off, only mark dirty, don't auto-save
    if (!_hydrated || !autoSave) {
      set({ _saveTimeout: null });
      return;
    }

    const delay = _hydrated ? autoSaveInterval : AUTOSAVE_DELAY;
    const timeout = setTimeout(() => {
      if (useSettingsStore.getState().autoSave) void get().flushPendingSave().catch(() => undefined);
    }, delay);

    set({ _saveTimeout: timeout });
  },

  cancelAndWait: async () => {
    saveEpoch++;
    const timer = get()._saveTimeout; if (timer) clearTimeout(timer);
    set({_saveTimeout: null});
    try { await activeSave; } catch { /* 放弃未保存草稿不应被已失败的写入阻止。 */ }
  },

  reset: () => {
    const { _saveTimeout } = get();
    if (_saveTimeout) clearTimeout(_saveTimeout);
    set({
      currentResume: null,
      sections: [],
      isDirty: false,
      isSaving: false,
      _saveTimeout: null,
    });
  },
}));

// 切换开关立即取消或启动待保存任务，不能让旧定时器越过“手动保存”的边界。
useSettingsStore.subscribe((state, previous) => {
  if (state.autoSave === previous.autoSave) return;
  const current = useResumeStore.getState();
  if (!state.autoSave && current._saveTimeout) {
    void current.cancelAndWait();
    useResumeStore.setState({ _saveTimeout: null });
  } else if (state.autoSave && current.isDirty) current._scheduleSave();
});
