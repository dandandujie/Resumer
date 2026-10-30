import { useRecordingStore } from "./recording-store";
import { create } from "zustand";
import { useResumeStore } from "./resume-store";
import { useKnowledgeStore } from "./knowledge-store";
import { serializePurpose } from "@/lib/knowledge-page";
import * as api from "@/lib/tauri-api";

interface DocumentParticipant {
  dirty: () => boolean;
  save: () => Promise<void>;
  discard: () => void | Promise<void>;
}
export const originalDocuments = new Map<string, DocumentParticipant>();
export type LeaveRequest = {
  action: () => void | Promise<void>;
  kind: "leave" | "required";
  scope: "all" | "resume";
};
export function hasUnsaved(scope: LeaveRequest["scope"] = "all") {
  return (
    useResumeStore.getState().isDirty ||
    [...originalDocuments.values()].some((p) => p.dirty()) ||
    (scope === "all" &&
      (Object.keys(useKnowledgeStore.getState().drafts).length > 0 || Object.keys(useRecordingStore.getState().drafts).length > 0))
  );
}
export async function saveUnsaved(scope: LeaveRequest["scope"]) {
  await useResumeStore.getState().flushPendingSave();
  for (const participant of originalDocuments.values())
    await participant.save();
  if (scope === "all") {
    for (const id of Object.keys(useRecordingStore.getState().drafts)) await useRecordingStore.getState().save(id);
    const store = useKnowledgeStore.getState();
    for (const [path, draft] of Object.entries(store.drafts)) {
      await store.write(
        path,
        typeof draft === "string" ? draft : serializePurpose(draft),
      );
      store.clearSavedDraft(path, draft);
    }
  }
}
export async function discardUnsaved(scope: LeaveRequest["scope"]) {
  await useResumeStore.getState().cancelAndWait();
  const resume = useResumeStore.getState();
  if (resume.isDirty && resume.currentResume) {
    const saved = await api.getResume(resume.currentResume.id);
    if (!saved) throw new Error("找不到已保存的简历，当前草稿仍保留。");
    resume.setResume(saved);
  }
  for (const participant of originalDocuments.values())
    await participant.discard();
  if (scope === "all") { useKnowledgeStore.setState({ drafts: {},draftBases:{} }); useRecordingStore.setState({ drafts: {} }); }
}
export const useUnsavedStore = create<{
  request: LeaveRequest | null;
  ask: (
    action: LeaveRequest["action"],
    kind?: LeaveRequest["kind"],
    scope?: LeaveRequest["scope"],
  ) => void;
  clear: () => void;
}>((set, get) => ({
  request: null,
  ask: (action, kind = "leave", scope = "all") => {
    if (get().request) return;
    if (!hasUnsaved(scope)) {
      void action();
      return;
    }
    void useResumeStore.getState().cancelAndWait();
    set({ request: { action, kind, scope } });
  },
  clear: () => {
    set({ request: null });
    if (useResumeStore.getState().isDirty)
      useResumeStore.getState()._scheduleSave();
  },
}));
