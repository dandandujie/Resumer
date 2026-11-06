import type { Resume } from './resume';

export interface PracticeTarget { sectionId: string; itemId?: string | null; field: string; text: string; label: string }
export type PracticeAction = 'answer' | 'clarify' | 'skip';
export interface PracticeEvaluation { score: number | null; coveredPoints: string[]; evidenceQuotes: string[]; suggestion: string; nextQuestion: string }
export interface PracticeRound { id: string; action: PracticeAction; question: string; answer: string; evaluation: PracticeEvaluation }
export interface PracticeFinding { kind: 'knowledge' | 'expression' | 'fact'; detail: string; roundId: string; quote: string; nextAction: string }
export interface PracticeSummary { summary: string; findings: PracticeFinding[]; nextAction: string; rewriteSuggestion: string }
export interface PracticeSession {
  id: string; resumeId: string; applicationId: string | null; resumeVersionId: string; resumeSnapshot: Resume;
  target: PracticeTarget | null; context: { company: string; role: string; round: string; jd: string; focus: string };
  points: string[]; rounds: PracticeRound[]; pendingQuestion: string; coveredPoints: string[];
  status: 'in_progress' | 'done'; summary: PracticeSummary | null; revision: number; createdAt: number; updatedAt: number;
}
export interface PracticeReview { sessionId: string; index: number; finding: PracticeFinding; status: 'open' | 'mastered'; note: string; target: PracticeTarget | null; resumeVersionId: string }
