import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { generateId } from '@/lib/utils';
import * as api from '@/lib/tauri-api';

export interface ReflectionState {
  status: 'running' | 'done' | 'error';
  result?: api.ReflectOutput;
  error?: string;
}

export interface KnowledgeProposal {
  id: string;
  path: string;
  content: string;
  reason: string;
}

/** 选择器里的空列表必须是同一个引用：`|| []` 每次都是新数组，zustand 会判定变化而无限重渲染（白屏）。 */
export const NO_PROPOSALS: KnowledgeProposal[] = [];

/* ────────────────────────────────────────────────────────────────────────────
   求职动态：以「投递」为中心的数据模型。

   一条 Application = 一次投递（公司 + 岗位 + 这一次尝试），拥有自己的面试轮次与
   结果，并记录当时用的是哪份简历（resumeId，可为空：简历删掉了投递事实还在）。
   数据存 SQLite（与简历同库同备份）；本 store 是内存镜像 + 写穿透。
   ──────────────────────────────────────────────────────────────────────────── */

export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'declined'
  | 'ghosted';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'submitted',
  'screening',
  'interview',
  'offer',
  'rejected',
  'declined',
  'ghosted',
];

/** 还在进行中的状态：待跟进 / 逾期提醒只针对它们。 */
export const OPEN_STATUSES: ApplicationStatus[] = ['submitted', 'screening', 'interview'];

export type InterviewFormat = 'phone' | 'video' | 'onsite' | 'take-home' | 'other';
export const INTERVIEW_FORMATS: InterviewFormat[] = ['phone', 'video', 'onsite', 'take-home', 'other'];

export type OutcomeResult = 'offer' | 'rejected' | 'withdrew' | 'ghosted';
export const OUTCOME_RESULTS: OutcomeResult[] = ['offer', 'rejected', 'withdrew', 'ghosted'];

export interface InterviewRound {
  id: string;
  round: string; // 一面 / 二面 / HR 面 …
  format?: InterviewFormat;
  scheduledAt?: string; // YYYY-MM-DDTHH:mm
  durationMin?: number;
  location?: string; // 现场地址 / 会议链接
  interviewer?: string;
  topics?: string;
  notes?: string;
  createdAt: number; // 毫秒
}

export interface Outcome {
  result: OutcomeResult;
  reason?: string;
  reflection?: string;
  date?: string;
}

export interface Application {
  id: string;
  resumeId: string | null;
  /** 投递时留档的简历版本（resume_versions.id）；改选简历时重新留档。 */
  resumeVersionId: string | null;
  company: string;
  role: string;
  channel: string;
  appliedDate: string; // YYYY-MM-DD
  status: ApplicationStatus;
  hrName: string;
  hrContact: string;
  jd: string;
  notes: string;
  nextFollowUp: string; // YYYY-MM-DD
  interviews: InterviewRound[];
  outcome: Outcome | null;
  createdAt: number; // unix 秒
  updatedAt: number; // unix 秒
}

export interface MockInterview {
  id: string;
  resumeId: string | null;
  applicationId: string | null;
  company: string;
  role: string;
  feedback: string;
  transcript: string;
  createdAt: number; // unix 秒
}

export const CHANNEL_PRESETS = [
  'Boss直聘',
  '猎聘',
  '拉勾',
  '智联招聘',
  '前程无忧',
  '内推',
  '官网直投',
  '脉脉',
  '猎头',
  '校招系统',
] as const;

const LEGACY_STORAGE_KEY = 'jade_journal_v2';
const LEGACY_BACKUP_KEY = 'jade_journal_v2_migrated';
const PERSIST_DEBOUNCE_MS = 400;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as string[]).includes(value);
}

function fromRecord(record: api.ApplicationRecord): Application {
  return {
    id: record.id,
    resumeId: record.resumeId ?? null,
    resumeVersionId: record.resumeId ? record.resumeVersionId ?? null : null,
    company: record.company ?? '',
    role: record.role ?? '',
    channel: record.channel ?? '',
    appliedDate: record.appliedDate ?? '',
    status: isStatus(record.status) ? record.status : 'submitted',
    hrName: record.hrName ?? '',
    hrContact: record.hrContact ?? '',
    jd: record.jd ?? '',
    notes: record.notes ?? '',
    nextFollowUp: record.nextFollowUp ?? '',
    interviews: Array.isArray(record.interviews) ? (record.interviews as InterviewRound[]) : [],
    outcome: (record.outcome as Outcome | null) ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toRecord(app: Application): api.ApplicationRecord {
  return { ...app };
}

/** 最新一轮面试（按约定时间，其次按创建时间）。 */
export function latestInterview(app: Application): InterviewRound | undefined {
  if (!app.interviews.length) return undefined;
  return [...app.interviews].sort((a, b) => {
    const ta = a.scheduledAt ? Date.parse(a.scheduledAt) : a.createdAt;
    const tb = b.scheduledAt ? Date.parse(b.scheduledAt) : b.createdAt;
    return tb - ta;
  })[0];
}

/** 下一场还没到的面试（用于日程与列表里的"下一步"）。 */
export function nextInterview(app: Application, now = Date.now()): InterviewRound | undefined {
  return [...app.interviews]
    .filter((r) => r.scheduledAt && Date.parse(r.scheduledAt) >= now)
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!))[0];
}

export function isOverdue(app: Application, today = todayKey()): boolean {
  return !!app.nextFollowUp && app.nextFollowUp < today && OPEN_STATUSES.includes(app.status);
}

/* ─── 旧版 localStorage 数据迁移（只跑一次） ─── */

interface LegacyApplication {
  id?: string;
  resumeId?: string;
  createdAt?: number;
  updatedAt?: number;
  company?: string;
  role?: string;
  channel?: string;
  appliedDate?: string;
  status?: string;
  hrName?: string;
  hrContact?: string;
  jdSnippet?: string;
  jd?: string;
  notes?: string;
  nextFollowUp?: string;
  interviews?: InterviewRound[];
  outcome?: Outcome | null;
}

interface LegacyMock {
  id?: string;
  resumeId?: string;
  createdAt?: number;
  company?: string;
  role?: string;
  feedback?: string;
  transcript?: string;
}

function msToSecs(ms: number | undefined): number {
  if (!ms || !Number.isFinite(ms)) return 0;
  return ms > 10_000_000_000 ? Math.floor(ms / 1000) : Math.floor(ms);
}

async function migrateLegacyStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return;
  let parsed: { applications?: Record<string, LegacyApplication[]>; mocks?: Record<string, LegacyMock[]> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }
  const applications: api.ApplicationRecord[] = Object.values(parsed?.applications || {})
    .flat()
    .filter((a) => a && a.id)
    .map((a) => ({
      id: a.id!,
      resumeId: a.resumeId || null,
      company: a.company || '',
      role: a.role || '',
      channel: a.channel || '',
      appliedDate: a.appliedDate || '',
      status: isStatus(a.status) ? a.status : 'submitted',
      hrName: a.hrName || '',
      hrContact: a.hrContact || '',
      jd: a.jd || a.jdSnippet || '',
      notes: a.notes || '',
      nextFollowUp: a.nextFollowUp || '',
      interviews: Array.isArray(a.interviews) ? a.interviews : [],
      outcome: a.outcome ?? null,
      createdAt: msToSecs(a.createdAt),
      updatedAt: msToSecs(a.updatedAt),
    }));
  const mocks: api.MockInterviewRecord[] = Object.values(parsed?.mocks || {})
    .flat()
    .filter((m) => m && m.id)
    .map((m) => ({
      id: m.id!,
      resumeId: m.resumeId || null,
      applicationId: null,
      company: m.company || '',
      role: m.role || '',
      feedback: m.feedback || '',
      transcript: m.transcript || '',
      createdAt: msToSecs(m.createdAt),
    }));
  await api.importLegacyJournal(applications, mocks);
  // 迁移成功后把原文留一份备份，再也不读它。
  window.localStorage.setItem(LEGACY_BACKUP_KEY, raw);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

/* ─── Store ─── */

interface JournalStore {
  applications: Application[];
  mocks: MockInterview[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  createApplication: (data: Partial<Application>) => Promise<Application>;
  updateApplication: (id: string, patch: Partial<Application>) => void;
  deleteApplication: (id: string) => Promise<void>;
  addInterview: (appId: string, round?: Partial<InterviewRound>) => InterviewRound | undefined;
  updateInterview: (appId: string, roundId: string, patch: Partial<InterviewRound>) => void;
  removeInterview: (appId: string, roundId: string) => void;
  setOutcome: (appId: string, outcome: Outcome | null) => void;
  addMock: (data: Omit<MockInterview, 'id' | 'createdAt'>) => Promise<MockInterview>;
  removeMock: (id: string) => Promise<void>;
  reflections: Record<string, ReflectionState>;
  knowledgeProposals: Record<string, KnowledgeProposal[]>;
  reflectApplication: (id: string) => Promise<void>;
  /** 提案被采纳或撤销后从列表移除；卡片自身不保存状态，避免换页后"复活"。 */
  resolveKnowledgeProposal: (proposalId: string) => void;
}

let hydratePromise: Promise<void> | null = null;
let proposalListenerStarted = false;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const versionRequests = new Map<string, symbol>();
const persistQueues = new Map<string, Promise<unknown>>();

/** 同一投递的写入与删除串行，防止慢的旧保存覆盖新值或让已删除记录复活。 */
function enqueuePersist<T>(id: string, action: () => Promise<T>): Promise<T> {
  const task = (persistQueues.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
  persistQueues.set(id, task);
  const cleanup = () => { if (persistQueues.get(id) === task) persistQueues.delete(id); };
  void task.then(cleanup, cleanup);
  return task;
}

/** 文本框逐字输入会高频触发更新；按投递 id 合并写库。 */
function schedulePersist(get: () => JournalStore, id: string) {
  const existing = persistTimers.get(id);
  if (existing) clearTimeout(existing);
  persistTimers.set(
    id,
    setTimeout(() => {
      persistTimers.delete(id);
      enqueuePersist(id, async () => {
        const app = get().applications.find((a) => a.id === id);
        if (app) await api.saveApplication(toRecord(app));
      }).catch((err) => {
        import('@/stores/error-log-store').then(({ logError }) => {
          logError('投递记录保存失败', String(err?.message || err));
        });
      });
    }, PERSIST_DEBOUNCE_MS)
  );
}

/** 给投递记录留一份"当时的简历"快照并回填 resumeVersionId；简历为空则清掉关联。 */
async function linkResumeVersion(get: () => JournalStore, id: string) {
  const request = Symbol(id);
  versionRequests.set(id, request);
  const app = get().applications.find((a) => a.id === id);
  if (!app) { versionRequests.delete(id); return; }
  if (!app.resumeId) {
    versionRequests.delete(id);
    get().updateApplication(id, { resumeVersionId: null });
    return;
  }
  try {
    const label = [app.company, app.role].filter(Boolean).join(' · ');
    const versionId = await api.createResumeVersion(app.resumeId, 'apply', label);
    const current = get().applications.find((entry) => entry.id === id);
    if (versionId && versionRequests.get(id) === request && current?.resumeId === app.resumeId) {
      get().updateApplication(id, { resumeVersionId: versionId });
    }
  } catch (err) {
    const { logError } = await import('@/stores/error-log-store');
    if (versionRequests.get(id) === request) logError('简历版本留档失败', String((err as Error)?.message || err));
  } finally {
    if (versionRequests.get(id) === request) versionRequests.delete(id);
  }
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  applications: [],
  mocks: [],
  loaded: false,
  reflections: {},
  knowledgeProposals: {},

  hydrate: () => {
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        await migrateLegacyStorage();
      } catch (err) {
        console.error('Legacy journal migration failed:', err);
      }
      if (!proposalListenerStarted) {
        proposalListenerStarted = true;
        void listen<any>('ai-chat-event', (event) => {
          const item = event.payload?.event;
          if (item?.type !== 'knowledgeProposal' || (!item.applicationId && item.source !== 'knowledge')) return;
          const key = item.applicationId || '__global__';
          set((state) => ({
            knowledgeProposals: {
              ...state.knowledgeProposals,
              [key]: [...(state.knowledgeProposals[key] || []), {
                id: String(item.proposalId || generateId()),
                path: item.path,
                content: item.content,
                reason: item.reason,
              }],
            },
          }));
        });
      }
      try {
        const [apps, mocks] = await Promise.all([api.listApplications(), api.listMockInterviews()]);
        set({ applications: apps.map(fromRecord), mocks, loaded: true });
      } catch (err) {
        console.error('Failed to load journal:', err);
        set({ loaded: true });
      }
    })();
    return hydratePromise;
  },

  createApplication: async (data) => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const draft: Application = {
      id: generateId(),
      resumeId: null,
      resumeVersionId: null,
      company: '',
      role: '',
      channel: '',
      appliedDate: todayKey(),
      status: 'submitted',
      hrName: '',
      hrContact: '',
      jd: '',
      notes: '',
      nextFollowUp: '',
      interviews: [],
      outcome: null,
      createdAt: nowSecs,
      updatedAt: nowSecs,
      ...data,
    };
    set((state) => ({ applications: [draft, ...state.applications] }));
    const saved = fromRecord(await enqueuePersist(draft.id, () => api.saveApplication(toRecord(draft))));
    // 创建等待期间仍可能编辑或删除，不能用创建快照覆盖这些操作。
    set((state) => ({ applications: state.applications.map((a) => (a === draft ? saved : a)) }));
    const current = get().applications.find(a => a.id === saved.id);
    if (current?.resumeId && current.resumeId === draft.resumeId) void linkResumeVersion(get, saved.id);
    return current ?? saved;
  },

  updateApplication: (id, patch) => {
    const before = get().applications.find((a) => a.id === id);
    const resumeChanged = patch.resumeId !== undefined && patch.resumeId !== before?.resumeId;
    set((state) => ({
      applications: state.applications.map((a) =>
        a.id === id ? { ...a, ...patch, ...(resumeChanged ? { resumeVersionId: null } : {}), updatedAt: Math.floor(Date.now() / 1000) } : a
      ),
    }));
    schedulePersist(get, id);
    // 换了简历就重新留档"投出去的那一版"
    if (resumeChanged) {
      void linkResumeVersion(get, id);
    }
  },

  deleteApplication: async (id) => {
    versionRequests.delete(id);
    const timer = persistTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      persistTimers.delete(id);
    }
    set((state) => ({
      applications: state.applications.filter((a) => a.id !== id),
      mocks: state.mocks.map((m) => (m.applicationId === id ? { ...m, applicationId: null } : m)),
    }));
    await enqueuePersist(id, () => api.deleteApplication(id));
  },

  addInterview: (appId, round = {}) => {
    const app = get().applications.find((a) => a.id === appId);
    if (!app) return undefined;
    const created: InterviewRound = {
      id: generateId(),
      round: '',
      format: 'video',
      createdAt: Date.now(),
      ...round,
    };
    get().updateApplication(appId, {
      interviews: [...app.interviews, created],
      // 加了面试轮次，说明这条投递已经进入面试阶段。
      status: app.status === 'submitted' || app.status === 'screening' ? 'interview' : app.status,
    });
    return created;
  },

  updateInterview: (appId, roundId, patch) => {
    const app = get().applications.find((a) => a.id === appId);
    if (!app) return;
    get().updateApplication(appId, {
      interviews: app.interviews.map((r) => (r.id === roundId ? { ...r, ...patch } : r)),
    });
  },

  removeInterview: (appId, roundId) => {
    const app = get().applications.find((a) => a.id === appId);
    if (!app) return;
    get().updateApplication(appId, { interviews: app.interviews.filter((r) => r.id !== roundId) });
  },

  setOutcome: (appId, outcome) => {
    const app = get().applications.find((a) => a.id === appId);
    if (!app) return;
    // 结果决定状态：出了结果就不再是"进行中"；清掉结果则回到面试/投递态。
    let status: ApplicationStatus = app.status;
    if (outcome) {
      status =
        outcome.result === 'offer'
          ? 'offer'
          : outcome.result === 'rejected'
            ? 'rejected'
            : outcome.result === 'withdrew'
              ? 'declined'
              : 'ghosted';
    } else if (!OPEN_STATUSES.includes(app.status)) {
      status = app.interviews.length > 0 ? 'interview' : 'submitted';
    }
    get().updateApplication(appId, { outcome, status });
  },

  addMock: async (data) => {
    const saved = await api.createMockInterview({ ...data, id: generateId(), createdAt: 0 });
    set((state) => ({ mocks: [saved, ...state.mocks] }));
    return saved;
  },

  reflectApplication: async (id) => {
    set((state) => ({ reflections: { ...state.reflections, [id]: { status: 'running' } } }));
    try {
      const result = await api.knowledgeReflect(id);
      set((state) => ({ reflections: { ...state.reflections, [id]: { status: 'done', result } } }));
    } catch (error) {
      const message = String((error as Error)?.message || error);
      set((state) => ({ reflections: { ...state.reflections, [id]: { status: 'error', error: message } } }));
      const { logError } = await import('@/stores/error-log-store');
      logError('复盘失败', message);
    }
  },

  resolveKnowledgeProposal: (proposalId) =>
    set((state) => ({
      knowledgeProposals: Object.fromEntries(
        Object.entries(state.knowledgeProposals).map(([key, list]) => [
          key,
          list.filter((proposal) => proposal.id !== proposalId),
        ]),
      ),
    })),

  removeMock: async (id) => {
    set((state) => ({ mocks: state.mocks.filter((m) => m.id !== id) }));
    await api.deleteMockInterview(id);
  },
}));

/* ─── 汇总：仪表盘、漏斗、日程 ─── */

export interface ChannelStat {
  channel: string;
  total: number;
  reachedInterview: number;
  offers: number;
}

export interface FunnelStage {
  applied: number;
  screening: number; // 至少进入初筛（含之后阶段）
  interview: number; // 至少进入面试
  offer: number;
  closed: number; // 被拒 / 婉拒 / 失联
}

export interface JournalAggregate {
  totalApplications: number;
  totalInterviews: number; // 面试轮次总数
  interviewedApplications: number; // 至少有一轮面试的投递
  offerCount: number;
  rejectCount: number;
  pendingCount: number; // 进行中
  overdueFollowUps: number;
  topCompanies: { company: string; count: number }[];
  byChannel: ChannelStat[];
  funnel: FunnelStage;
}

/** 一条投递是否"到过面试阶段"：有面试轮次，或状态本身已在面试及之后。 */
export function reachedInterview(app: Application): boolean {
  return app.interviews.length > 0 || app.status === 'interview' || app.status === 'offer' || app.outcome?.result === 'offer';
}

export function aggregateJournal(applications: Application[]): JournalAggregate {
  const apps = applications;
  const today = todayKey();
  const offerCount = apps.filter((a) => a.outcome?.result === 'offer' || a.status === 'offer').length;
  const rejectCount = apps.filter((a) => a.outcome?.result === 'rejected' || a.status === 'rejected').length;
  const pendingCount = apps.filter((a) => OPEN_STATUSES.includes(a.status)).length;
  const totalInterviews = apps.reduce((sum, a) => sum + a.interviews.length, 0);
  const interviewedApplications = apps.filter((a) => a.interviews.length > 0).length;

  const companies: Record<string, number> = {};
  for (const a of apps) {
    const k = a.company.trim();
    if (k) companies[k] = (companies[k] || 0) + 1;
  }
  const topCompanies = Object.entries(companies)
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const channelMap: Record<string, ChannelStat> = {};
  for (const a of apps) {
    const key = a.channel.trim() || '未记录';
    if (!channelMap[key]) channelMap[key] = { channel: key, total: 0, reachedInterview: 0, offers: 0 };
    channelMap[key].total++;
    if (reachedInterview(a)) channelMap[key].reachedInterview++;
    if (a.outcome?.result === 'offer' || a.status === 'offer') channelMap[key].offers++;
  }
  const byChannel = Object.values(channelMap).sort((a, b) => b.total - a.total);

  const interviewStage = apps.filter(reachedInterview).length;
  const funnel: FunnelStage = {
    applied: apps.length,
    screening: interviewStage + apps.filter((a) => a.status === 'screening').length,
    interview: interviewStage,
    offer: offerCount,
    closed: apps.filter((a) => a.status === 'rejected' || a.status === 'declined' || a.status === 'ghosted').length,
  };

  return {
    totalApplications: apps.length,
    totalInterviews,
    interviewedApplications,
    offerCount,
    rejectCount,
    pendingCount,
    overdueFollowUps: apps.filter((a) => isOverdue(a, today)).length,
    topCompanies,
    byChannel,
    funnel,
  };
}

export type AgendaKind = 'interview' | 'followUpOverdue' | 'followUpDue';

export interface AgendaItem {
  kind: AgendaKind;
  app: Application;
  round?: InterviewRound;
  /** 排序用时间戳（毫秒） */
  at: number;
}

/** 接下来要做的事：未来 N 天内的面试、逾期与今日到期的跟进。 */
export function buildAgenda(applications: Application[], days = 7, now = Date.now()): AgendaItem[] {
  const today = todayKey();
  const horizon = now + days * 24 * 60 * 60 * 1000;
  const items: AgendaItem[] = [];
  for (const app of applications) {
    if (!OPEN_STATUSES.includes(app.status)) continue;
    for (const round of app.interviews) {
      if (!round.scheduledAt) continue;
      const at = Date.parse(round.scheduledAt);
      if (Number.isFinite(at) && at >= now - 60 * 60 * 1000 && at <= horizon) {
        items.push({ kind: 'interview', app, round, at });
      }
    }
    if (app.nextFollowUp) {
      const at = Date.parse(app.nextFollowUp);
      if (app.nextFollowUp < today) items.push({ kind: 'followUpOverdue', app, at });
      else if (app.nextFollowUp === today) items.push({ kind: 'followUpDue', app, at });
    }
  }
  return items.sort((a, b) => a.at - b.at);
}
