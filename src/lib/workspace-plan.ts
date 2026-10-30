import type {
  Application,
  InterviewRound,
  Outcome,
} from "@/stores/journal-store";
import {
  APPLICATION_STATUSES,
  INTERVIEW_FORMATS,
  OUTCOME_RESULTS,
} from "./journal-values";
import type { WorkspaceAction } from "./tauri-api";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export const FIELD_LABELS: Record<string, string> = {
  company: "公司",
  role: "岗位",
  jd: "招聘信息",
  channel: "投递渠道",
  appliedDate: "投递日期",
  status: "进展",
  hrName: "联系人",
  hrContact: "联系方式",
  notes: "记录",
  nextFollowUp: "下次跟进",
  round: "面试轮次",
  scheduledAt: "面试时间",
  format: "面试形式",
  durationMin: "时长（分钟）",
  location: "地点 / 链接",
  interviewer: "面试官",
  topics: "面试主题",
  result: "结果",
  reason: "原因",
  reflection: "复盘",
  date: "日期",
  title: "名称",
  purpose: "用途",
  category: "标签",
  tags: "标签",
  focus: "练习重点",
  body: "Wiki 内容",
};
export const VALUE_LABELS: Record<string, string> = {
  submitted: "已投递",
  screening: "筛选中",
  interview: "面试中",
  offer: "收到 Offer",
  rejected: "未通过",
  declined: "已婉拒",
  ghosted: "暂无回复",
  withdrew: "主动退出",
  phone: "电话",
  video: "视频",
  onsite: "现场",
  "take-home": "作业",
  other: "其他",
};
const KEYS: Record<string, string[]> = {
  application: [
    "company",
    "role",
    "jd",
    "channel",
    "appliedDate",
    "status",
    "hrName",
    "hrContact",
    "notes",
    "nextFollowUp",
  ],
  interview: [
    "round",
    "scheduledAt",
    "format",
    "durationMin",
    "location",
    "interviewer",
    "topics",
    "notes",
  ],
  outcome: ["result", "reason", "reflection", "date"],
  collection: ["title", "purpose", "category", "tags"],
  mock: ["company", "role", "round", "jd", "focus"],
  wiki: ["title", "body"],
};
export function validateWorkspaceFields(action: WorkspaceAction) {
  const allowed = KEYS[action.kind];
  if (!allowed) throw Error("不支持此操作");
  for (const [key, value] of Object.entries(action.fields)) {
    if(key==='tags'&&action.kind==='collection'){if(!Array.isArray(value)||value.length>50||value.some(v=>typeof v!=='string'||!v.trim()||v.length>80))throw Error('标签列表无效');continue;}
    if (
      !allowed.includes(key) ||
      (key === "durationMin"
        ? typeof value !== "number"
        : typeof value !== "string")
    )
      throw Error(`不支持修改：${key}`);
    if (
      ["appliedDate", "nextFollowUp", "date"].includes(key) &&
      value &&
      !validDate(String(value))
    )
      throw Error("日期不明确，请补充具体日期");
    if (
      key === "scheduledAt" &&
      value &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value)) ||
        !validDate(String(value).slice(0, 10)) ||
        Number(String(value).slice(11, 13)) > 23 ||
        Number(String(value).slice(14, 16)) > 59)
    )
      throw Error("面试时间不明确，请补充日期和时间");
    if (
      key === "durationMin" &&
      (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 1440)
    )
      throw Error("面试时长无效");
    const enums: Record<string, readonly string[]> = {
      status: APPLICATION_STATUSES,
      format: INTERVIEW_FORMATS,
      result: OUTCOME_RESULTS,
    };
    if (enums[key] && !enums[key].includes(String(value)))
      throw Error("AI 状态无效");
  }
}
export function assertUnchanged(base: unknown, current: unknown) {
  if (JSON.stringify(base) !== JSON.stringify(current))
    throw Error("生成提案后内容已有变化，请重新整理，避免覆盖你的新编辑");
}
export function buildJournalDraft(
  actions: WorkspaceAction[],
  base: Application[],
  createId = () => crypto.randomUUID(),
) {
  const drafts = new Map<
    string,
    { id: string; before: Application | null; after: Partial<Application> }
  >();
  const aliases = new Map<string, string>();
  for (const action of actions) {
    validateWorkspaceFields(action);
    if (!["application", "interview", "outcome"].includes(action.kind))
      throw Error("操作不属于投递记录");
    let id = action.targetId;
    if (action.kind === "application" && (!id || id.startsWith("new:"))) {
      const alias = id || "new:default";
      if (!aliases.has(alias)) aliases.set(alias, createId());
      id = aliases.get(alias)!;
    } else id = aliases.get(id || "new:default") || id;
    const before = base.find((a) => a.id === id) || null;
    if (!before && ![...aliases.values()].includes(id))
      throw Error("AI 未明确指定已有投递，请补充公司和岗位");
    const draft = drafts.get(id) || {
      id,
      before,
      after: before
        ? structuredClone(before)
        : { id, company: "", role: "", interviews: [], outcome: null },
    };
    if (action.kind === "application")
      Object.assign(draft.after, action.fields);
    else if (action.kind === "interview") {
      const rounds = draft.after.interviews || [];
      if (action.roundId) {
        if (!rounds.some((r) => r.id === action.roundId))
          throw Error("面试轮次不存在");
        draft.after.interviews = rounds.map((r) =>
          r.id === action.roundId ? { ...r, ...action.fields } : r,
        ) as InterviewRound[];
      } else
        draft.after.interviews = [
          ...rounds,
          {
            id: createId(),
            round: "",
            createdAt: Date.now(),
            ...action.fields,
          },
        ] as InterviewRound[];
    } else {
      draft.after.outcome = {
        ...draft.after.outcome,
        ...action.fields,
      } as Outcome;
      const result = draft.after.outcome.result;
      if (result)
        draft.after.status = result === "withdrew" ? "declined" : result;
    }
    drafts.set(id, draft);
  }
  return [...drafts.values()];
}
