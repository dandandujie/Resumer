import { create } from 'zustand';
import * as api from '@/lib/tauri-api';
import { resolveTheme } from '@/lib/theme-config';
import { generateId } from '@/lib/utils';
import type { ResolvedTheme } from '@/types/resume';

export interface CustomThemePreset {
  id: string;
  name: string;
  theme: ResolvedTheme;
}

interface ThemePresetsStore {
  presets: CustomThemePreset[];
  loaded: boolean;
  loading: boolean;
  loadError: boolean;
  saving: boolean;
  load: () => Promise<void>;
  add: (name: string, theme: ResolvedTheme) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// 存入用户设置数据库，跨简历共享，并随现有数据库备份一起迁移。
// 写入成功后再更新列表；失败时保留原预设，不显示虚假的保存成功。
export const useThemePresetsStore = create<ThemePresetsStore>((set, get) => {
  const persist = async (presets: CustomThemePreset[]) => {
    if (!get().loaded || get().saving) throw new Error('Presets are not ready');
    set({ saving: true });
    try {
      await api.updateSettings({ customThemePresets: presets });
      set({ presets });
    } finally {
      set({ saving: false });
    }
  };
  return {
    presets: [], loaded: false, loading: false, loadError: false, saving: false,
    load: async () => {
      if (get().loaded || get().loading) return;
      set({ loading: true, loadError: false });
      try {
        const settings = await api.getSettings();
        const values: unknown[] = Array.isArray(settings?.customThemePresets) ? settings.customThemePresets : [];
        const presets = values.flatMap((value) => {
          if (!value || typeof value !== 'object') return [];
          const item = value as Partial<CustomThemePreset>;
          if (typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim() || !item.theme || typeof item.theme !== 'object') return [];
          return [{ id: item.id, name: item.name.trim(), theme: resolveTheme(item.theme) }];
        });
        set({ presets, loaded: true });
      } catch {
        set({ loadError: true });
      } finally {
        set({ loading: false });
      }
    },
    add: async (name, theme) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 40 || ['标准', 'standard'].includes(trimmed.toLowerCase()) || get().presets.some((preset) => preset.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error('Invalid preset name');
      }
      await persist([...get().presets, { id: generateId(), name: trimmed, theme: structuredClone(resolveTheme(theme)) }]);
    },
    remove: async (id) => persist(get().presets.filter((preset) => preset.id !== id)),
  };
});
