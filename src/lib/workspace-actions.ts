import type { Application } from "@/stores/journal-store";
import { useJournalStore } from "@/stores/journal-store";
import type { WorkspaceAction, JournalPlan } from "./tauri-api";
import { buildJournalDraft } from "./workspace-plan";
export {
  FIELD_LABELS,
  VALUE_LABELS,
  validateWorkspaceFields,
  assertUnchanged,
  buildJournalDraft,
} from "./workspace-plan";

// 同一张审阅卡的失败重试使用相同 ID 和请求；不会再次分配新投递 ID。
const preparedPlans = new WeakMap<WorkspaceAction[], JournalPlan>();
const executions = new WeakMap<WorkspaceAction[], Promise<string[]>>();
export async function applyJournalActions(actions: WorkspaceAction[], base: Application[]) {
  const existing = executions.get(actions);
  if (existing) return existing;
  let plan = preparedPlans.get(actions);
  if (!plan) {
    const drafts = buildJournalDraft(actions, base);
    const today = new Date().toLocaleDateString("sv-SE");
    plan = {
      id: crypto.randomUUID(),
      entries: drafts.map(d => ({
        before: d.before,
        after: {
          resumeId: null, resumeVersionId: null, company: "", role: "", channel: "",
          appliedDate: today, status: "submitted", hrName: "", hrContact: "", jd: "", notes: "",
          nextFollowUp: "", interviews: [], outcome: null, createdAt: 0, updatedAt: 0,
          ...d.after, id: d.id,
        },
      })),
    };
    preparedPlans.set(actions, plan);
  }
  const task = useJournalStore.getState().applyPlan(plan);
  executions.set(actions, task);
  try { return await task; }
  catch (error) { if (executions.get(actions) === task) executions.delete(actions); throw error; }
}
