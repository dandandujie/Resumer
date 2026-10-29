/**
 * Client-side AI service — wraps Tauri AI commands.
 * Provides a unified interface for frontend components.
 */
import * as api from '@/lib/tauri-api';
import { useResumeStore } from '@/stores/resume-store';
import { listen } from '@tauri-apps/api/event';

interface GrammarCheckParams {
  resumeId: string;
  language?: string;
}

export async function checkGrammar(params: GrammarCheckParams) {
  return api.aiGrammarCheck(params);
}

interface JdAnalysisParams {
  resumeId: string;
  jobDescription: string;
  company?: string;
  role?: string;
}

export async function analyzeJd(params: JdAnalysisParams) {
  return api.aiJdAnalysis(params);
}

// Alias used by older code
export const analyzeJD = analyzeJd;

interface TranslateParams {
  resumeId: string;
  targetLanguage: 'zh' | 'en';
  mode?: 'overwrite' | 'copy';
  onProgress?: (
    completed: number,
    total: number,
    section?: { sectionId: string; title: string; content: any },
  ) => void;
}

export async function translateResume(params: TranslateParams) {
  let unlisten: (() => void) | undefined;
  try {
    // If copy mode, duplicate resume first then translate the copy
    let targetResumeId = params.resumeId;
    if (params.mode === 'copy') {
      targetResumeId = await api.duplicateResume(params.resumeId);
    }

    // Subscribe to progress events
    if (params.onProgress) {
      unlisten = await listen<{ total: number; done: number }>(
        'ai-translate-progress',
        (evt) => {
          params.onProgress?.(evt.payload.done, evt.payload.total);
        },
      );
    }

    const result = await api.aiTranslate({
      resumeId: targetResumeId,
      targetLanguage: params.targetLanguage,
    });

    // Reload current resume if overwrite mode
    if (params.mode === 'overwrite') {
      const fresh = await api.getResume(targetResumeId);
      if (fresh) {
        useResumeStore.getState().setResume({
          ...fresh,
          sections: (fresh as any).sections || [],
          themeConfig: (fresh as any).themeConfig || {},
        } as any);
      }
    }

    return {
      ...result,
      newResumeId: params.mode === 'copy' ? targetResumeId : undefined,
      failedCount: result.failedSections || 0,
    };
  } finally {
    if (unlisten) unlisten();
  }
}

interface GenerateResumeParams {
  description: string;
  language?: string;
}

export async function generateResume(params: GenerateResumeParams) {
  const resumeId = await api.aiGenerateResume(params);
  return { resumeId };
}
