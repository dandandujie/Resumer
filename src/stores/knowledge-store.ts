import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PurposeFields } from "@/lib/knowledge-page";
import * as api from "@/lib/tauri-api";

/** 上传后待采纳的实体页：带上来源页路径，采纳时写进 frontmatter.sources。 */
export interface PendingEntity extends api.KnowledgeEntity {
  sourcePath: string;
}

interface KnowledgeStore {
  drafts: Record<string, string | PurposeFields>;
  draftBases: Record<string, string>;
  setDraft: (path: string, value: string | PurposeFields) => void;
  clearSavedDraft: (
    path: string,
    saved: string | PurposeFields | undefined,
  ) => void;
  pages: api.KnowledgePageSummary[];
  selectedPath: string | null;
  selectedContent: string;
  pendingEntities: PendingEntity[];
  loading: boolean;
  /** 跨页跳转要打开的页面（例如仪表盘引导 → purpose.md 编辑），load 时一次性消费。 */
  pendingOpen: { path: string; edit: boolean } | null;
  requestOpen: (path: string, edit: boolean) => void;
  load: () => Promise<void>;
  reindex: () => Promise<number>;
  select: (path: string) => Promise<void>;
  write: (path: string, content: string) => Promise<void>;
  ingest: (
    bytes: number[],
    filename: string,
  ) => Promise<api.KnowledgeIngestResult>;
  adoptEntity: (entity: PendingEntity) => Promise<string>;
  dismissEntity: (entity: PendingEntity) => void;
  setSelectedContent: (content: string) => void;
}

const ENTITY_DIRECTORY: Record<string, string> = {
  company: "companies",
  role: "roles",
  market: "market",
};

/** 文件名只保留中英文、数字与连字符，其余字符折叠为 `-`。 */
export function entityPagePath(entity: api.KnowledgeEntity): string {
  const directory = ENTITY_DIRECTORY[entity.type] || "market";
  const slug =
    entity.title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "untitled";
  return `wiki/${directory}/${slug}.md`;
}

// 只发布最后一次页面读取，防止快速点选时慢响应覆盖新页面。
let selectionRequest = 0;

export const useKnowledgeStore = create<KnowledgeStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      draftBases: {},
      setDraft: (path, value) =>
        set((state) => ({
          drafts: { ...state.drafts, [path]: value },
          draftBases:
            state.draftBases[path] !== undefined
              ? state.draftBases
              : state.selectedPath === path
                ? { ...state.draftBases, [path]: state.selectedContent }
                : state.draftBases,
        })),
      clearSavedDraft: (path, saved) =>
        set((state) => {
          // 保存等待期间可能又输入了内容，只清除本次真正提交的版本。
          if (state.drafts[path] !== saved) return state;
          const drafts = { ...state.drafts };
          delete drafts[path];
          const draftBases = { ...state.draftBases };
          delete draftBases[path];
          return { drafts, draftBases };
        }),
      pages: [],
      selectedPath: null,
      selectedContent: "",
      pendingEntities: [],
      loading: false,
      pendingOpen: null,

      requestOpen: (path, edit) => set({ pendingOpen: { path, edit } }),

      load: async () => {
        set({ loading: true });
        try {
          const pages = await api.knowledgeList();
          set({ pages });
          const pending = get().pendingOpen;
          if (pending && pages.some((page) => page.path === pending.path)) {
            await get().select(pending.path);
          } else if (!get().selectedPath && pages[0]) {
            await get().select(pages[0].path);
          }
        } finally {
          set({ loading: false });
        }
      },

      reindex: async () => {
        set({ loading: true });
        try {
          const count = await api.knowledgeReindex();
          await get().load();
          const { selectedPath } = get();
          if (selectedPath) await get().select(selectedPath);
          return count;
        } finally {
          set({ loading: false });
        }
      },

      select: async (path) => {
        const request = ++selectionRequest;
        const content = await api.knowledgeRead(path);
        if (request === selectionRequest)
          set((state) => ({
            selectedPath: path,
            selectedContent: content,
            draftBases:
              state.drafts[path] !== undefined &&
              state.draftBases[path] === undefined
                ? { ...state.draftBases, [path]: content }
                : state.draftBases,
          }));
      },

      write: async (path, content) => {
        const expected =
          get().draftBases[path] ??
          (get().selectedPath === path ? get().selectedContent : undefined);
        if (get().drafts[path] !== undefined && expected === undefined)
          throw Error("请先打开这篇笔记确认内容后再保存，草稿仍保留");
        await api.knowledgeWrite(path, content, expected);
        // 后端可能补齐 frontmatter，回读以保证编辑器显示的就是盘上内容。
        const contentOnDisk = await api.knowledgeRead(path);
        if (get().selectedPath === path)
          set({ selectedContent: contentOnDisk });
        await get().load();
      },

      ingest: async (bytes, filename) => {
        const result = await api.knowledgeIngestFile(bytes, filename);
        const entities = (result.entities || []).map((entity) => ({
          ...entity,
          sourcePath: result.source.path,
        }));
        set((state) => ({
          pendingEntities: [...state.pendingEntities, ...entities],
        }));
        await get().load();
        return result;
      },

      adoptEntity: async (entity) => {
        const path = entityPagePath(entity);
        await api.knowledgeCreatePage({
          path,
          title: entity.title,
          kind: entity.type,
          body: entity.content,
          sources: [entity.sourcePath],
        });
        get().dismissEntity(entity);
        await get().load();
        await get().select(path);
        return path;
      },

      dismissEntity: (entity) =>
        set((state) => ({
          pendingEntities: state.pendingEntities.filter(
            (item) => item !== entity,
          ),
        })),

      setSelectedContent: (content) => set({ selectedContent: content }),
    }),
    {
      name: "resumer-knowledge-drafts",
      partialize: (state) => ({
        drafts: state.drafts,
        draftBases: state.draftBases,
      }),
    },
  ),
);
