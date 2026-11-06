import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getAIConfig } from './tauri-api';
import type { WorkNote, WorkNoteDraft, WorkExperience } from '@/types/work-notes';
export const listNotes = (query = '', context: string | null = null, offset = 0, experienceId: string | null = null) => invoke<WorkNote[]>('work_notes_list', { query, context, offset, experienceId });
export const noteContexts = () => invoke<string[]>('work_notes_contexts');
export const noteAnalysisErrors = () => {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(localStorage).filter(k => k.startsWith('resumer_note_analysis_error:'))) errors[key.slice('resumer_note_analysis_error:'.length)] = localStorage.getItem(key) || '';
  return errors;
};
export function notifyNotesChanged() {
  window.dispatchEvent(new Event('work-notes-changed'));
  void emit('work-notes-changed').catch(() => { /* focus refresh also recovers IPC notification failures */ });
}
export const saveNote = async (note: Pick<WorkNote, 'id' | 'body' | 'context' | 'occurredOn' | 'experienceId'>, expectedRevision: number | null = null) => {
  const saved = await invoke<WorkNote>('work_notes_save', { note, expectedRevision });
  notifyNotesChanged(); return saved;
};
export const deleteNote = async (note: WorkNote) => {
  await invoke<void>('work_notes_delete', { id: note.id, expectedRevision: note.revision });
  localStorage.removeItem(`resumer_note_analysis_error:${note.id}`);
  notifyNotesChanged();
  for (const key of Object.keys(localStorage).filter(key => key.startsWith('resumer_note_review:'))) {
    try { if (JSON.parse(localStorage.getItem(key) || '{}').sourceIds?.includes(note.id)) localStorage.removeItem(key); } catch { localStorage.removeItem(key); }
  }
};
export const analyzeNote = async (id: string) => {
  try {
    const note = await invoke<WorkNote>('work_notes_analyze', { id, config: getAIConfig() });
    localStorage.removeItem(`resumer_note_analysis_error:${id}`);
    return note;
  } catch (e) {
    try { localStorage.setItem(`resumer_note_analysis_error:${id}`, String((e as Error).message || e)); } catch { /* caller still shows the failure */ }
    throw e;
  } finally { notifyNotesChanged(); }
};
export const composeNotes = (ids: string[], question: string, slot: string, searchContext: string | null = null, searchQuery: string | null = null, experienceId: string | null = null) => invoke<WorkNoteDraft>('work_notes_compose', { ids, question, slot, searchContext, searchQuery, experienceId, config: getAIConfig() });
export const loadNoteDraft = (slot: string) => invoke<WorkNoteDraft | null>('work_notes_draft', { slot });
export const validateNoteSources = (sources: WorkNote[]) => invoke<void>('work_notes_validate', { sources });

export const listExperiences = () => invoke<WorkExperience[]>('experiences_list');
export const saveExperience = async (experience: Omit<WorkExperience,'noteCount'>) => { await invoke<void>('experiences_save',{experience}); notifyNotesChanged(); };
export const assignNotes = async (ids:string[],experienceId:string) => { await invoke<void>('experiences_assign',{ids,experienceId}); notifyNotesChanged(); };
