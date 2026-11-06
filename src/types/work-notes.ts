export type NoteKind = 'routine' | 'event' | 'reflection';
export interface NoteSource { id: string; quote: string }
export interface WorkNoteAnalysis {
  reply: string;
  kind: NoteKind;
  facts: { text: string; quote: string }[];
  question: string;
}
export interface WorkNote {
  id: string;
  experienceId?: string | null;
  body: string;
  context: string;
  occurredOn: string;
  revision: number;
  analysis: WorkNoteAnalysis | null;
  createdAt: number;
}
export interface WorkNoteDraft {
  question: string;
  reply: string;
  bullets: { text: string; kind: 'routine' | 'event'; sources: NoteSource[] }[];
  sources: WorkNote[];
  stale: boolean;
}

export interface WorkExperience { id: string; company: string; position: string; kind: 'work' | 'internship'; startedOn: string; current: boolean; noteCount: number }
