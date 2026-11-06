export interface ResumeWorkspaceDraft {
  goal: string;
  title: string;
  company: string;
  role: string;
  jobDescription: string;
  request: { id: string; fingerprint: string } | null;
}
export const emptyResumeWorkspaceDraft = (): ResumeWorkspaceDraft => ({ goal: '', title: '', company: '', role: '', jobDescription: '', request: null });
const key = (resumeId: string) => `resumer:resume-workspace-draft:${resumeId}`;
export function loadResumeWorkspaceDraft(storage: Pick<Storage, 'getItem'>, resumeId: string): ResumeWorkspaceDraft {
  const raw = storage.getItem(key(resumeId));
  if (!raw) return emptyResumeWorkspaceDraft();
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('草稿格式无法读取');
  const draft = data as Record<string, unknown>;
  for (const field of ['goal', 'title', 'company', 'role', 'jobDescription']) {
    if (typeof draft[field] !== 'string') throw new Error('草稿格式无法读取');
  }
  if (draft.request !== null && (!draft.request || typeof draft.request !== 'object' || typeof (draft.request as Record<string, unknown>).id !== 'string' || typeof (draft.request as Record<string, unknown>).fingerprint !== 'string')) throw new Error('草稿请求标识无法读取');
  return draft as unknown as ResumeWorkspaceDraft;
}
export function saveResumeWorkspaceDraft(storage: Pick<Storage, 'setItem'>, resumeId: string, draft: ResumeWorkspaceDraft) {
  storage.setItem(key(resumeId), JSON.stringify(draft));
}
export function clearResumeWorkspaceDraft(storage: Pick<Storage, 'removeItem'>, resumeId: string) {
  storage.removeItem(key(resumeId));
}
