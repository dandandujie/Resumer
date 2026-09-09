import { create } from 'zustand';
import * as api from '@/lib/tauri-api';

/** 上传后待采纳的实体页：带上来源页路径，采纳时写进 frontmatter.sources。 */
export interface PendingEntity extends api.KnowledgeEntity {
  sourcePath: string;
}

interface KnowledgeStore {
  pages: api.KnowledgePageSummary[];
  selectedPath: string | null;
  selectedContent: string;
  pendingEntities: PendingEntity[];
  loading: boolean;
  load: () => Promise<void>;
  reindex: () => Promise<number>;
  select: (path: string) => Promise<void>;
  write: (path: string, content: string) => Promise<void>;
  ingest: (bytes: number[], filename: string) => Promise<api.KnowledgeIngestResult>;
  adoptEntity: (entity: PendingEntity) => Promise<string>;
  dismissEntity: (entity: PendingEntity) => void;
  setSelectedContent: (content: string) => void;
}

const ENTITY_DIRECTORY: Record<string, string> = {
  company: 'companies',
  role: 'roles',
  market: 'market',
};

/** 文件名只保留中英文、数字与连字符，其余字符折叠为 `-`。 */
export function entityPagePath(entity: api.KnowledgeEntity): string {
  const directory = ENTITY_DIRECTORY[entity.type] || 'market';
  const slug = entity.title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'untitled';
  return `wiki/${directory}/${slug}.md`;
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
      set({ pages });
      if (!get().selectedPath && pages[0]) await get().select(pages[0].path);
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
    const content = await api.knowledgeRead(path);
    set({ selectedPath: path, selectedContent: content });
  },

  write: async (path, content) => {
    await api.knowledgeWrite(path, content);
    // 后端可能补齐 frontmatter，回读以保证编辑器显示的就是盘上内容。
    await get().select(path);
    await get().load();
  },

  ingest: async (bytes, filename) => {
    const result = await api.knowledgeIngestFile(bytes, filename);
    const entities = (result.entities || []).map((entity) => ({ ...entity, sourcePath: result.source.path }));
    set((state) => ({ pendingEntities: [...state.pendingEntities, ...entities] }));
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
    set((state) => ({ pendingEntities: state.pendingEntities.filter((item) => item !== entity) })),

  setSelectedContent: (content) => set({ selectedContent: content }),
}));
