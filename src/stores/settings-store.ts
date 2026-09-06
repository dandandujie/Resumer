import { create } from 'zustand';
import * as api from '@/lib/tauri-api';

export type AIProvider = 'openai' | 'anthropic' | 'gemini';
export type WebSearchMode =
  | 'off'
  | 'native'
  | 'free'
  | 'bing'
  | 'google'
  | 'baidu'
  | 'tavily'
  | 'grok';

/** 一个保存好的 API 渠道：协议 + 地址 + Key + 默认模型 + 常用模型列表。 */
export interface AIChannel {
  id: string;
  name: string;
  provider: AIProvider; // 请求协议：openai 兼容所有 OpenAI 格式中转 / anthropic / gemini
  baseURL: string;
  apiKey: string;
  model: string; // 默认模型
  models: string[]; // 常用模型列表（对话框里的模型选择器只显示这些）
  builtin?: boolean;
}

/** 首次运行时预置的官方渠道（Key 留空等用户填写）。 */
export const CHANNEL_PRESETS: Array<
  Omit<AIChannel, 'id' | 'apiKey' | 'models'>
> = [
  {
    name: 'OpenAI',
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    builtin: true,
  },
  {
    name: 'Anthropic',
    provider: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    builtin: true,
  },
  {
    name: 'Gemini',
    provider: 'gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    builtin: true,
  },
  {
    name: 'Grok (xAI)',
    provider: 'openai',
    baseURL: 'https://api.x.ai/v1',
    model: 'grok-4-fast',
    builtin: true,
  },
  {
    name: 'DeepSeek',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    builtin: true,
  },
  {
    name: 'Moonshot (Kimi)',
    provider: 'openai',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    builtin: true,
  },
  {
    name: 'MiniMax',
    provider: 'openai',
    baseURL: 'https://api.minimax.chat/v1',
    model: 'abab6.5s-chat',
    builtin: true,
  },
  {
    name: '智谱 (Zhipu GLM)',
    provider: 'openai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    builtin: true,
  },
];

interface SettingsStore {
  // 当前生效的 AI 配置 —— 始终是选中渠道的镜像，供请求层直接读取
  aiProvider: AIProvider;
  aiApiKey: string;
  aiBaseURL: string;
  aiModel: string;
  webSearchMode: WebSearchMode;
  tavilyApiKey: string;
  grokApiKey: string;
  grokBaseURL: string;
  grokModel: string;
  channels: AIChannel[];
  activeChannelId: string | null;
  // 编辑器偏好
  autoSave: boolean;
  autoSaveInterval: number; // 毫秒

  _hydrated: boolean;

  selectChannel: (id: string) => void;
  addChannel: (name: string) => string;
  updateChannel: (
    id: string,
    patch: Partial<Omit<AIChannel, 'id' | 'builtin'>>,
  ) => void;
  deleteChannel: (id: string) => void;
  toggleChannelModel: (id: string, model: string) => void;
  setChannelModels: (id: string, models: string[]) => void;
  setWebSearchMode: (mode: WebSearchMode) => void;
  setTavilyApiKey: (key: string) => void;
  setGrokApiKey: (key: string) => void;
  setGrokBaseURL: (url: string) => void;
  setGrokModel: (model: string) => void;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  hydrate: () => Promise<void>;
}

const WEB_SEARCH_MODE_KEY = 'jade_web_search_mode';
const TAVILY_KEY_STORAGE_KEY = 'jade_tavily_key';
const GROK_KEY_STORAGE_KEY = 'jade_grok_key';
const GROK_BASE_URL_KEY = 'jade_grok_base_url';
const GROK_MODEL_KEY = 'jade_grok_model';
const GROK_DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const GROK_DEFAULT_MODEL = 'grok-4-fast';
const CHANNELS_KEY = 'jade_channels';
const ACTIVE_CHANNEL_KEY = 'jade_active_channel';

// 渠道功能出现之前的单服务商配置，只在首次迁移时读取一次。
const LEGACY_API_KEY = 'jade_api_key';
const LEGACY_PROVIDER_CONFIGS = 'jade_provider_configs';
const LEGACY_ACTIVE_PROVIDER = 'jade_active_provider';
const LEGACY_KEYS = [
  LEGACY_API_KEY,
  LEGACY_PROVIDER_CONFIGS,
  LEGACY_ACTIVE_PROVIDER,
  'resumer_ai_usage_logs_v1',
  'jade_fingerprint',
];

function loadWebSearchMode(): WebSearchMode {
  if (typeof window === 'undefined') return 'off';
  const value = localStorage.getItem(WEB_SEARCH_MODE_KEY);
  return [
    'native',
    'free',
    'bing',
    'google',
    'baidu',
    'tavily',
    'grok',
  ].includes(value || '')
    ? (value as WebSearchMode)
    : 'off';
}

function loadLocal(key: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) || fallback;
}

function saveLocal(key: string, value: string) {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

function genChannelId(): string {
  return `ch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normHost(url: string): string {
  return (url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function normalizeProvider(value: unknown): AIProvider {
  return value === 'anthropic' || value === 'gemini' ? value : 'openai';
}

function saveChannels(channels: AIChannel[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels));
  } catch {
    /* ignore */
  }
}

function saveActiveChannelId(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(ACTIVE_CHANNEL_KEY, id);
    else localStorage.removeItem(ACTIVE_CHANNEL_KEY);
  } catch {
    /* ignore */
  }
}

function clearLegacyKeys() {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * 读取渠道；首次运行时预置官方渠道，并把旧版单服务商配置迁进匹配的渠道，
 * 保证升级后 API Key / 模型不丢。
 */
function loadOrSeedChannels(): {
  channels: AIChannel[];
  activeChannelId: string | null;
} {
  if (typeof window === 'undefined')
    return { channels: [], activeChannelId: null };

  let stored: AIChannel[] = [];
  try {
    const raw = localStorage.getItem(CHANNELS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) stored = parsed as AIChannel[];
  } catch {
    stored = [];
  }

  if (stored.length > 0) {
    // 默认模型永远在常用列表里
    let mutated = false;
    for (const c of stored) {
      if (!c.models) {
        c.models = c.model ? [c.model] : [];
        mutated = true;
      } else if (c.model && !c.models.includes(c.model)) {
        c.models.push(c.model);
        mutated = true;
      }
    }
    if (mutated) saveChannels(stored);
    clearLegacyKeys();
    const activeId = localStorage.getItem(ACTIVE_CHANNEL_KEY);
    const activeChannelId = stored.some((c) => c.id === activeId)
      ? activeId
      : stored[0].id;
    return { channels: stored, activeChannelId };
  }

  const curProvider = normalizeProvider(
    localStorage.getItem(LEGACY_ACTIVE_PROVIDER),
  );
  const curKey = localStorage.getItem(LEGACY_API_KEY) || '';
  let curCfg: { baseURL?: string; model?: string } | undefined;
  try {
    curCfg = JSON.parse(
      localStorage.getItem(LEGACY_PROVIDER_CONFIGS) || '{}',
    )?.[curProvider];
  } catch {
    curCfg = undefined;
  }
  const curBaseURL = curCfg?.baseURL || '';
  const curModel = curCfg?.model || '';

  const channels: AIChannel[] = CHANNEL_PRESETS.map((preset, i) => ({
    id: `ch_seed_${i}`,
    apiKey: '',
    models: preset.model ? [preset.model] : [],
    ...preset,
  }));

  let activeChannelId: string | null = channels[0].id;
  if (curKey) {
    const byHost = channels.find(
      (c) =>
        c.provider === curProvider &&
        normHost(c.baseURL) === normHost(curBaseURL),
    );
    const byProvider = channels.find((c) => c.provider === curProvider);
    const target = byHost || byProvider;
    if (target) {
      target.apiKey = curKey;
      if (curModel) {
        target.model = curModel;
        if (!target.models.includes(curModel)) target.models.push(curModel);
      }
      activeChannelId = target.id;
    } else {
      const custom: AIChannel = {
        id: genChannelId(),
        name: '我的配置',
        provider: curProvider,
        baseURL: curBaseURL || channels[0].baseURL,
        apiKey: curKey,
        model: curModel,
        models: curModel ? [curModel] : [],
      };
      channels.push(custom);
      activeChannelId = custom.id;
    }
  }

  saveChannels(channels);
  saveActiveChannelId(activeChannelId);
  clearLegacyKeys();
  return { channels, activeChannelId };
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function syncEditorPrefs(state: SettingsStore) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await api.updateSettings({
        autoSave: state.autoSave,
        autoSaveInterval: state.autoSaveInterval,
      });
    } catch {
      // 本地状态已是最新，后端同步失败可忽略
    }
  }, 500);
}

function mirrorOf(channel: AIChannel | undefined) {
  return {
    aiProvider: channel?.provider ?? 'openai',
    aiBaseURL: channel?.baseURL ?? 'https://api.openai.com/v1',
    aiModel: channel?.model ?? 'gpt-4o',
    aiApiKey: channel?.apiKey ?? '',
  } as const;
}

function initialAIState() {
  const { channels, activeChannelId } = loadOrSeedChannels();
  const active = channels.find((c) => c.id === activeChannelId);
  return { channels, activeChannelId, ...mirrorOf(active) };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initialAIState(),
  webSearchMode: loadWebSearchMode(),
  tavilyApiKey: loadLocal(TAVILY_KEY_STORAGE_KEY),
  grokApiKey: loadLocal(GROK_KEY_STORAGE_KEY),
  grokBaseURL: loadLocal(GROK_BASE_URL_KEY, GROK_DEFAULT_BASE_URL),
  grokModel: loadLocal(GROK_MODEL_KEY, GROK_DEFAULT_MODEL),
  autoSave: true,
  autoSaveInterval: 500,
  _hydrated: false,

  selectChannel: (id) => {
    const channel = get().channels.find((c) => c.id === id);
    if (!channel) return;
    set({ activeChannelId: id, ...mirrorOf(channel) });
    saveActiveChannelId(id);
  },

  addChannel: (name) => {
    const channel: AIChannel = {
      id: genChannelId(),
      name: name.trim() || '自定义渠道',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      model: '',
      models: [],
    };
    const next = [...get().channels, channel];
    set({ channels: next });
    saveChannels(next);
    get().selectChannel(channel.id);
    return channel.id;
  },

  updateChannel: (id, patch) => {
    const next = get().channels.map((c) => {
      if (c.id !== id) return c;
      const merged = { ...c, ...patch };
      if (
        typeof patch.model === 'string' &&
        patch.model &&
        !merged.models.includes(patch.model)
      ) {
        merged.models = [...merged.models, patch.model];
      }
      return merged;
    });
    set({ channels: next });
    saveChannels(next);
    if (get().activeChannelId === id) {
      set(mirrorOf(next.find((x) => x.id === id)));
    }
  },

  deleteChannel: (id) => {
    const remaining = get().channels.filter((c) => c.id !== id);
    set({ channels: remaining });
    saveChannels(remaining);
    if (get().activeChannelId === id) {
      if (remaining.length > 0) get().selectChannel(remaining[0].id);
      else {
        set({ activeChannelId: null, ...mirrorOf(undefined) });
        saveActiveChannelId(null);
      }
    }
  },

  toggleChannelModel: (id, model) => {
    const channel = get().channels.find((c) => c.id === id);
    if (!channel) return;
    const models = channel.models.includes(model)
      ? channel.models.filter((m) => m !== model)
      : [...channel.models, model];
    get().updateChannel(id, { models });
  },

  setChannelModels: (id, models) => {
    get().updateChannel(id, { models });
  },

  setWebSearchMode: (mode) => {
    set({ webSearchMode: mode });
    saveLocal(WEB_SEARCH_MODE_KEY, mode);
  },

  setTavilyApiKey: (key) => {
    set({ tavilyApiKey: key });
    saveLocal(TAVILY_KEY_STORAGE_KEY, key);
  },

  setGrokApiKey: (key) => {
    set({ grokApiKey: key });
    saveLocal(GROK_KEY_STORAGE_KEY, key);
  },

  setGrokBaseURL: (url) => {
    set({ grokBaseURL: url });
    saveLocal(GROK_BASE_URL_KEY, url);
  },

  setGrokModel: (model) => {
    set({ grokModel: model });
    saveLocal(GROK_MODEL_KEY, model);
  },

  setAutoSave: (enabled) => {
    set({ autoSave: enabled });
    syncEditorPrefs(get());
  },

  setAutoSaveInterval: (interval) => {
    set({ autoSaveInterval: interval });
    syncEditorPrefs(get());
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    try {
      const data = await api.getSettings();
      if (data && typeof data === 'object') {
        set({
          ...(typeof data.autoSave === 'boolean' && {
            autoSave: data.autoSave,
          }),
          ...(typeof data.autoSaveInterval === 'number' && {
            autoSaveInterval: data.autoSaveInterval,
          }),
          _hydrated: true,
        });
        return;
      }
    } catch {
      /* fall through */
    }
    set({ _hydrated: true });
  },
}));

// 请求层（tauri-api）通过 window 读取当前渠道，避免两个模块互相导入。
if (typeof window !== 'undefined') {
  (window as any).__jadeSettingsStore = useSettingsStore;
  void useSettingsStore.getState().hydrate();
}
