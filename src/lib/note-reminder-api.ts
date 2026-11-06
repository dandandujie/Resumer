import { invoke } from '@tauri-apps/api/core';
export interface NoteReminderConfig { enabled: boolean; time: string; weekdays: number[] }
export interface NoteReminderState { config: NoteReminderConfig; lastError: string | null }
export const getNoteReminder = () => invoke<NoteReminderState>('note_reminder_get');
export const setNoteReminder = (config: NoteReminderConfig) => invoke<void>('note_reminder_set', { config });
export const previewNoteReminder = () => invoke<void>('note_reminder_preview');
export const dismissNoteReminder = (action: 'close' | 'skip' | 'snooze' | 'saved') => invoke<void>('note_reminder_dismiss', { action });
