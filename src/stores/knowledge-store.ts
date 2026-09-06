import { create } from 'zustand';
import * as api from '@/lib/tauri-api';

interface KnowledgeStore {
  pages: api.KnowledgePageSummary[];
  selectedPath: string | null;
  selectedContent: string;
  pendingEntities: Array<{ type: string; title: string; content: string }>;
  loading: boolean;
  load: () => Promise<void>;
  select: (path: string) => Promise<void>;
  write: (path: string, content: string) => Promise<void>;
  ingest: (bytes: number[], filename: string) => Promise<void>;
  setSelectedContent: (content: string) => void;
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  pages: [],
  selectedPath: null,
  selectedContent: '',
  pendingEntities: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const pages = await api.knowledgeList();
      set({ pages, loading: false });
      if (!get().selectedPath && pages[0]) await get().select(pages[0].path);
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  select: async (path) => {
    const content = await api.knowledgeRead(path);
    set({ selectedPath: path, selectedContent: content });
  },

  write: async (path, content) => {
    await api.knowledgeWrite(path, content);
    set({ selectedPath: path, selectedContent: content });
    await get().load();
  },

  ingest: async (bytes, filename) => {
    const result = await api.knowledgeIngestFile(bytes, filename);
    set({ pendingEntities: result.entities || [] });
    await get().load();
  },

  setSelectedContent: (content) => set({ selectedContent: content }),
}));
