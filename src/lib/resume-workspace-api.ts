import { invoke } from '@tauri-apps/api/core';
import type { Resume } from '@/types/resume';

export interface ResumeWorkspaceContext {
  goal: string;
  company: string;
  role: string;
  jobDescription: string;
}
export interface ResumeWorkspaceMetadata {
  resumeId: string;
  baseResumeId: string;
  baseTitle: string;
  sourceResumeId: string | null;
  sourceTitle: string | null;
  context: ResumeWorkspaceContext | null;
  createdAt: number | null;
  sourceChanged: boolean;
  sourceMissing: boolean;
  baseMissing: boolean;
}
export interface ResumeWorkspaceDetail extends ResumeWorkspaceMetadata {
  sourceSnapshot: (Resume & { originalDocument?: unknown }) | null;
}
export interface DeriveResumeWorkspaceRequest extends ResumeWorkspaceContext {
  requestId: string;
  sourceResumeId: string;
  title: string;
}
async function userId() { return (await invoke<{ id: string }>('ensure_user')).id; }
export async function listResumeWorkspaces() {
  return invoke<ResumeWorkspaceMetadata[]>('resume_workspace_list', { userId: await userId() });
}
export async function getResumeWorkspace(resumeId: string) {
  return invoke<ResumeWorkspaceDetail>('resume_workspace_get', { userId: await userId(), resumeId });
}
export async function deriveResumeWorkspace(request: DeriveResumeWorkspaceRequest) {
  return invoke<string>('resume_workspace_derive', { userId: await userId(), request });
}
export async function updateResumeWorkspace(resumeId: string, context: ResumeWorkspaceContext) {
  return invoke<void>('resume_workspace_update', { userId: await userId(), resumeId, context });
}
