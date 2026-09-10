/**
 * Tauri 命令适配层：前端所有与 Rust 后端的交互都从这里走。
 */
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_THEME } from '@/lib/theme-config';

// ── 用户 ──
// 桌面端只有一个本地用户，由后端负责创建/归并；前端只缓存它的 id。
let _cachedUserId: string | null = null;
async function getCachedUserId(): Promise<string> {
  if (!_cachedUserId) {
    const user = await invoke<{ id: string }>('ensure_user');
    _cachedUserId = user.id;
  }
  return _cachedUserId;
}

// ── AI 配置 ──

export type AIProviderId = 'openai' | 'anthropic' | 'gemini';

export type WebSearchMode =
  | 'off'
  | 'native'
  | 'free'
  | 'bing'
  | 'google'
  | 'baidu'
  | 'tavily'
  | 'grok';

export interface AIRequestConfig {
  provider: AIProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  webSearchMode?: WebSearchMode;
  tavilyApiKey?: string;
  grokApiKey?: string;
  grokBaseUrl?: string;
  grokModel?: string;
}

interface SettingsSnapshot {
  aiProvider: AIProviderId;
  aiApiKey: string;
  aiBaseURL: string;
  aiModel: string;
  webSearchMode: WebSearchMode;
  tavilyApiKey: string;
  grokApiKey: string;
  grokBaseURL: string;
  grokModel: string;
}

const DEFAULT_CONFIG: AIRequestConfig = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  webSearchMode: 'off',
  tavilyApiKey: '',
  grokApiKey: '',
  grokBaseUrl: '',
  grokModel: '',
};

/**
 * 当前请求应使用的 AI 配置 = 设置里选中的渠道（可选覆盖模型）。
 * settings-store 通过 window 暴露自身，避免与本模块形成静态导入环。
 */
export function getAIConfig(modelOverride?: string): AIRequestConfig {
  const store =
    typeof window !== 'undefined'
      ? (window as any).__jadeSettingsStore
      : undefined;
  const state: SettingsSnapshot | undefined = store?.getState?.();
  const base: AIRequestConfig = state
    ? {
        provider: state.aiProvider,
        apiKey: state.aiApiKey,
        baseUrl: state.aiBaseURL,
        model: state.aiModel,
        webSearchMode: state.webSearchMode,
        tavilyApiKey: state.tavilyApiKey,
        grokApiKey: state.grokApiKey,
        grokBaseUrl: state.grokBaseURL,
        grokModel: state.grokModel,
      }
    : DEFAULT_CONFIG;
  const model = modelOverride?.trim();
  return model ? { ...base, model } : base;
}

export function isAIConfigured(): boolean {
  const config = getAIConfig();
  return Boolean(config.apiKey.trim() && config.baseUrl.trim());
}

export async function aiListModels(config: AIRequestConfig) {
  return invoke<{ id: string; label?: string | null }[]>('ai_list_models', {
    config,
  });
}

export async function aiTestConnection(config: AIRequestConfig) {
  return invoke<any>('ai_test_connection', { config });
}

// ── 简历 ──

export async function listResumes() {
  const userId = await getCachedUserId();
  return invoke<any[]>('list_resumes', { userId });
}

export async function getResume(id: string) {
  const userId = await getCachedUserId();
  return invoke<any>('get_resume', { id, userId });
}

export async function createResume(data: {
  title?: string;
  language?: string;
  template?: string;
  themeConfig?: any;
  sections?: any[];
}) {
  const userId = await getCachedUserId();
  return invoke<string>('create_resume', {
    userId,
    title: data.title || '未命名简历',
    template: data.template,
    language: data.language,
    themeConfig: data.themeConfig,
    sections: data.sections,
  });
}

/** 只提交给出的字段：仅传 title 就只改标题，模板/主题保持不动。 */
export async function updateResume(
  id: string,
  data: {
    title: string;
    template?: string;
    themeConfig?: any;
    sections?: any[];
  },
) {
  const userId = await getCachedUserId();
  const payload = JSON.parse(
    JSON.stringify({
      id,
      userId,
      title: data.title,
      template: data.template,
      themeConfig: data.themeConfig,
      sections: data.sections,
    }),
  );
  return invoke<void>('update_resume', { payload });
}

export async function deleteResume(id: string) {
  const userId = await getCachedUserId();
  return invoke<void>('delete_resume', { id, userId });
}

export async function duplicateResume(id: string) {
  const userId = await getCachedUserId();
  return invoke<string>('duplicate_resume', { id, userId });
}

// ── 版本历史 ──

export type ResumeVersionEvent = 'save' | 'export' | 'apply' | 'ai_accept' | 'restore';

export interface ResumeVersionSummary {
  id: string;
  resumeId: string;
  event: ResumeVersionEvent | string;
  label: string;
  resumeTitle: string;
  /** unix 秒 */
  createdAt: number;
}

export interface ResumeVersionDetail extends ResumeVersionSummary {
  snapshot: any;
}

export async function listResumeVersions(resumeId: string) {
  const userId = await getCachedUserId();
  return invoke<ResumeVersionSummary[]>('list_resume_versions', { resumeId, userId });
}

export async function getResumeVersion(id: string) {
  const userId = await getCachedUserId();
  return invoke<ResumeVersionDetail | null>('get_resume_version', { id, userId });
}

/** 在导出 / 投递 / AI 采纳等事件点显式留档；返回版本 id（内容未变且无标签时为 null）。 */
export async function createResumeVersion(resumeId: string, event: ResumeVersionEvent, label?: string) {
  const userId = await getCachedUserId();
  return invoke<string | null>('create_resume_version', { resumeId, userId, event, label });
}

export async function restoreResumeVersion(versionId: string, label: string) {
  const userId = await getCachedUserId();
  return invoke<void>('restore_resume_version', { versionId, userId, label });
}

// ── 知识库 ──

export interface KnowledgePageSummary {
  path: string;
  title: string;
  type: string;
  tags: string[];
  summary: string;
  updated: string;
  sources: string[];
}

export async function knowledgeList(type?: string) {
  return invoke<KnowledgePageSummary[]>('knowledge_list', { kind: type });
}

export async function knowledgeRead(path: string) {
  return invoke<string>('knowledge_read', { path });
}

export async function knowledgeWrite(path: string, content: string) {
  return invoke<void>('knowledge_write', { path, content });
}

export interface KnowledgeGraphData {
  nodes: Array<{ id: string; title: string; type: string }>;
  edges: Array<{ source: string; target: string; type: string }>;
}

export async function knowledgeSearch(query: string, type?: string, limit = 8) {
  return invoke<any[]>('knowledge_search', { query, kind: type, limit });
}

export async function knowledgeGraph() {
  return invoke<KnowledgeGraphData>('knowledge_graph');
}

export async function knowledgeLint() {
  return invoke<{
    issues: string[];
    proposals: Array<{ path: string; newContent: string; reason: string }>;
  }>('knowledge_lint');
}

export interface KnowledgeEntity {
  type: string;
  title: string;
  content: string;
}

export interface KnowledgeIngestResult {
  source: KnowledgePageSummary;
  entities: KnowledgeEntity[];
}

export async function knowledgeCreatePage(data: {
  path: string;
  title: string;
  kind: string;
  body: string;
  sources?: string[];
}) {
  return invoke<void>('knowledge_create_page', data);
}

export interface ReflectOutput {
  experiencePage: { path: string; content: string };
  proposals: Array<{ path: string; newContent: string; reason: string }>;
  insights: string[];
}

export async function knowledgeReflect(applicationId: string) {
  return invoke<ReflectOutput>('knowledge_reflect', { applicationId, config: getAIConfig() });
}

export async function knowledgeInterviewPrep(applicationId: string, language: string) {
  return invoke<{ path: string; content: string }>('knowledge_interview_prep', {
    applicationId,
    config: getAIConfig(),
    language,
  });
}

export async function knowledgeStrategyReview() {
  return invoke<any>('knowledge_strategy_review', { config: getAIConfig() });
}

export async function knowledgePurpose() {
  return invoke<string>('knowledge_purpose');
}

export async function knowledgeReindex() {
  return invoke<number>('knowledge_reindex');
}

export async function knowledgeIngestFile(bytes: number[], filename: string) {
  return invoke<KnowledgeIngestResult>('knowledge_ingest_file', { config: getAIConfig(), bytes, filename });
}

// ── 用户设置 ──

export async function getSettings() {
  const userId = await getCachedUserId();
  return invoke<any>('get_settings', { userId });
}

export async function updateSettings(settings: Record<string, any>) {
  const userId = await getCachedUserId();
  return invoke<void>('update_settings', { userId, settings });
}

// ── 单次 AI 任务 ──

export async function aiGrammarCheck(data: {
  resumeId: string;
  language?: string;
}) {
  return invoke<any>('ai_grammar_check', {
    config: getAIConfig(),
    resumeId: data.resumeId,
    language: data.language,
  });
}

export type CoverLetterStyle = 'boss_greeting' | 'email' | 'self_intro';

export async function aiCoverLetter(data: {
  resumeId: string;
  jobDescription?: string;
  company?: string;
  role?: string;
  style: CoverLetterStyle;
  language?: string;
}) {
  return invoke<string>('ai_cover_letter', {
    config: getAIConfig(),
    resumeId: data.resumeId,
    jobDescription: data.jobDescription,
    company: data.company,
    role: data.role,
    style: data.style,
    language: data.language,
  });
}

export async function aiJdAnalysis(data: {
  resumeId: string;
  jobDescription: string;
  company?: string;
  role?: string;
}) {
  return invoke<any>('ai_jd_analysis', {
    config: getAIConfig(),
    resumeId: data.resumeId,
    jobDescription: data.jobDescription,
    company: data.company,
    role: data.role,
  });
}

export async function aiTranslate(data: {
  resumeId: string;
  targetLanguage: 'zh' | 'en';
}) {
  return invoke<any>('ai_translate', {
    config: getAIConfig(),
    resumeId: data.resumeId,
    targetLanguage: data.targetLanguage,
  });
}

export async function aiGenerateResume(data: {
  description: string;
  language?: string;
}) {
  const userId = await getCachedUserId();
  return invoke<string>('ai_generate_resume', {
    config: getAIConfig(),
    userId,
    description: data.description,
    language: data.language,
    // 新简历的主题基底由前端唯一默认主题给出，Rust 不保存默认值
    themeConfig: DEFAULT_THEME,
  });
}

export async function aiFetchGithubRepo(url: string) {
  return invoke<any>('ai_fetch_github_repo', { url });
}

export async function listGrammarChecks(resumeId: string) {
  return invoke<any[]>('list_grammar_checks', { resumeId });
}

export async function getGrammarCheck(id: string) {
  return invoke<any>('get_grammar_check', { id });
}

export async function deleteGrammarCheck(id: string) {
  return invoke<void>('delete_grammar_check', { id });
}

export async function listJdAnalyses(resumeId: string) {
  return invoke<any[]>('list_jd_analyses', { resumeId });
}

export async function getJdAnalysis(id: string) {
  return invoke<any>('get_jd_analysis', { id });
}

export async function deleteJdAnalysis(id: string) {
  return invoke<void>('delete_jd_analysis', { id });
}

/** 上传 JSON/PDF/DOCX/图片，解析或替换简历，返回 resumeId。 */
export async function parseResumeFile(data: {
  file: File;
  language?: string;
  targetResumeId?: string;
}): Promise<string> {
  const buffer = await data.file.arrayBuffer();
  const userId = await getCachedUserId();
  return invoke<string>('parse_resume_file', {
    config: getAIConfig(),
    userId,
    fileData: Array.from(new Uint8Array(buffer)),
    fileType:
      data.file.type ||
      (
        {
          json: 'application/json',
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
        } as Record<string, string>
      )[data.file.name.split('.').pop()?.toLowerCase() || ''] ||
      '',
    language: data.language,
    targetResumeId: data.targetResumeId,
    themeConfig: DEFAULT_THEME,
  });
}

// ── 对话 ──

export async function listChatSessions(resumeId: string) {
  return invoke<any[]>('list_chat_sessions', { resumeId });
}

export async function getChatSession(sessionId: string) {
  return invoke<any>('get_chat_session', { sessionId });
}

export async function listChatMessages(
  sessionId: string,
  limit?: number,
  offset?: number,
) {
  return invoke<any>('list_chat_messages', { sessionId, limit, offset });
}

export async function createChatSession(resumeId: string, title?: string) {
  return invoke<string>('create_chat_session', { resumeId, title });
}

export async function cancelAiStream(streamId: string) {
  return invoke<void>('cancel_ai_stream', { streamId });
}

export async function truncateChatMessages(
  sessionId: string,
  messageId: string,
) {
  return invoke<void>('truncate_chat_messages', { sessionId, messageId });
}

export async function deleteChatSession(sessionId: string) {
  return invoke<void>('delete_chat_session', { sessionId });
}

export async function aiChat(data: {
  streamId: string;
  messages: { role: string; content: string }[];
  resumeId: string;
  sessionId?: string;
  selectedModel?: string;
}) {
  return invoke<any>('ai_chat', {
    streamId: data.streamId,
    config: getAIConfig(data.selectedModel),
    messages: data.messages,
    resumeId: data.resumeId,
    sessionId: data.sessionId,
  });
}

export async function interviewChat(data: {
  streamId: string;
  messages: { role: string; content: string }[];
  resumeId?: string;
  company?: string;
  role?: string;
  jd?: string;
  round?: string;
  selectedModel?: string;
}) {
  return invoke<any>('interview_chat', {
    streamId: data.streamId,
    config: getAIConfig(data.selectedModel),
    messages: data.messages,
    resumeId: data.resumeId,
    company: data.company,
    role: data.role,
    jd: data.jd,
    round: data.round,
  });
}

// ── 求职动态 ──

export interface ApplicationRecord {
  id: string;
  resumeId: string | null;
  resumeVersionId?: string | null;
  company: string;
  role: string;
  channel: string;
  appliedDate: string;
  status: string;
  hrName: string;
  hrContact: string;
  jd: string;
  notes: string;
  nextFollowUp: string;
  interviews: unknown[];
  outcome: unknown | null;
  /** unix 秒 */
  createdAt: number;
  updatedAt: number;
}

export interface MockInterviewRecord {
  id: string;
  resumeId: string | null;
  applicationId: string | null;
  company: string;
  role: string;
  feedback: string;
  transcript: string;
  /** unix 秒 */
  createdAt: number;
}

export async function listApplications() {
  return invoke<ApplicationRecord[]>('list_applications');
}

export async function saveApplication(application: ApplicationRecord) {
  return invoke<ApplicationRecord>('save_application', { application });
}

export async function deleteApplication(id: string) {
  return invoke<void>('delete_application', { id });
}

export async function importLegacyJournal(
  applications: ApplicationRecord[],
  mockInterviews: MockInterviewRecord[],
) {
  return invoke<number>('import_legacy_journal', {
    applications,
    mockInterviews,
  });
}

export async function listMockInterviews() {
  return invoke<MockInterviewRecord[]>('list_mock_interviews');
}

export async function createMockInterview(mock: MockInterviewRecord) {
  return invoke<MockInterviewRecord>('create_mock_interview', { mock });
}

export async function deleteMockInterview(id: string) {
  return invoke<void>('delete_mock_interview', { id });
}

// ── 备份与恢复 ──

/** 前端设置都在 localStorage（AI 渠道与 Key、联网搜索、界面语言），按前缀整体打包。 */
const LOCAL_SETTINGS_PREFIX = 'jade_';
const LOCAL_SETTINGS_EXTRA_KEYS = ['i18nextLng'];

export function collectLocalSettings(): string {
  const entries: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key.startsWith(LOCAL_SETTINGS_PREFIX) || LOCAL_SETTINGS_EXTRA_KEYS.includes(key)) {
      entries[key] = localStorage.getItem(key) ?? '';
    }
  }
  return JSON.stringify(entries);
}

export function applyLocalSettings(raw: string) {
  const entries = JSON.parse(raw) as Record<string, string>;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(LOCAL_SETTINGS_PREFIX)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith(LOCAL_SETTINGS_PREFIX) || LOCAL_SETTINGS_EXTRA_KEYS.includes(key)) {
      localStorage.setItem(key, value);
    }
  }
}

export interface RestoreResult {
  settings: string | null;
  safetyBackup: string;
  manifest: { format: number; appVersion: string; createdAt: string };
}

export async function backupCreate() {
  return invoke<string | null>('backup_create', { settings: collectLocalSettings() });
}

export async function backupRestore() {
  return invoke<RestoreResult | null>('backup_restore', { currentSettings: collectLocalSettings() });
}

export async function appRestart() {
  return invoke<void>('app_restart');
}

// ── 导出 ──

export async function exportPdf(
  resumeId: string,
  html: string,
  filename?: string,
) {
  return invoke<string | null>('export_pdf', {
    options: { resumeId, html, filename },
  });
}

export async function exportHtml(
  resumeId: string,
  html: string,
  filename?: string,
) {
  return invoke<string | null>('export_html', {
    options: { resumeId, html, filename },
  });
}

export async function exportTxt(resumeId: string, filename?: string) {
  return invoke<string | null>('export_txt', { resumeId, filename });
}

export async function exportMarkdown(resumeId: string, filename?: string) {
  return invoke<string | null>('export_markdown', { resumeId, filename });
}

export async function exportJson(resumeId: string, filename?: string) {
  return invoke<string | null>('export_json', { resumeId, filename });
}

export async function exportDocx(
  resumeId: string,
  theme: unknown,
  filename?: string,
) {
  return invoke<string | null>('export_docx', { resumeId, theme, filename });
}
