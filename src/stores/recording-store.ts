import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/tauri-api';

type Draft = { transcript: string; roundId: string | null; applicationId?: string; assetId?: string };
export const useRecordingStore = create<{
  drafts: Record<string, Draft>;
  jobs: Record<string, { done: number; total: number }>;
  edit: (id: string, draft: Draft) => void;
  clear: (id: string) => void;
  save: (id: string) => Promise<void>;
  progress: (id: string, value: { done: number; total: number } | null) => void;
}>()(
  persist((set, get) => ({
    drafts: {}, jobs: {},
    edit: (id, draft) => set((s) => ({ drafts: { ...s.drafts, [id]: draft } })),
    clear: (id) => set((s) => { const drafts = { ...s.drafts }; delete drafts[id]; return { drafts }; }),
    save: async (id) => {
      const draft = get().drafts[id];
      if (!draft) return;
      if(draft.assetId) await api.libraryAudioSave(draft.assetId,draft.transcript);
      else await api.recordingSave(id, draft.transcript, draft.roundId);
      // 保存期间产生的新输入必须继续保留。
      if (get().drafts[id] === draft) get().clear(id);
    },
    progress: (id, value) => set((s) => { const jobs = { ...s.jobs }; if (value) jobs[id] = value; else delete jobs[id]; return { jobs }; }),
  }), { name: 'resumer_recording_drafts_v1', partialize: (s) => ({ drafts: s.drafts }) }),
);
