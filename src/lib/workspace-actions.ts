import type { Application } from "@/stores/journal-store";
import { useJournalStore } from "@/stores/journal-store";
import type { WorkspaceAction } from "./tauri-api";
import { assertUnchanged, buildJournalDraft } from "./workspace-plan";
export {
  FIELD_LABELS,
  VALUE_LABELS,
  validateWorkspaceFields,
  assertUnchanged,
  buildJournalDraft,
} from "./workspace-plan";

export async function applyJournalActions(
  actions: WorkspaceAction[],
  base: Application[],
) {
  const drafts = buildJournalDraft(actions, base);
  const store = useJournalStore.getState();
  // 先校验全部目标，再写入，避免第一项已执行才发现后续目标不明确。
  for (const d of drafts)
    if (d.before)
      assertUnchanged(
        d.before,
        store.applications.find((a) => a.id === d.id),
      );
  for (const d of drafts) {
    if (d.before) {
      useJournalStore.getState().updateApplication(d.id, d.after);
      await useJournalStore.getState().flushApplication(d.id);
    } else await useJournalStore.getState().createApplication(d.after);
  }
  return drafts.map((d) => d.id);
}
