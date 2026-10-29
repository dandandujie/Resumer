import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/tauri-api';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection } from '@/types/resume';
import { logError } from '@/stores/error-log-store';

export function useEditor(resumeId: string) {
  const { setResume, sections, currentResume, updateSection, addSection, removeSection, reorderSections, reset: resetResume } = useResumeStore();
  const { pushSnapshot, reset: resetEditor, selectSection } = useEditorStore();
  const [isLoading, setIsLoading] = useState(true);
  const loadRequest = useRef(0);

  const loadResume = useCallback(async () => {
    const request = ++loadRequest.current;
    try {
      setIsLoading(true);
      const data = await api.getResume(resumeId);
      if (request !== loadRequest.current) return;
      if (data) {
        setResume({
          ...data,
          sections: data.sections || [],
          themeConfig: data.themeConfig || {},
        });
      }
    } catch (error) {
      console.error('Failed to load resume:', error);
      logError('加载失败', '简历加载失败，请刷新页面重试');
    } finally {
      if (request === loadRequest.current) setIsLoading(false);
    }
  }, [resumeId, setResume]);

  useEffect(() => {
    loadResume();
    return () => {
      loadRequest.current++;
      void useResumeStore.getState().flushPendingSave();
      resetResume();
      resetEditor();
    };
  }, [loadResume, resetResume, resetEditor]);

  const handleUpdateSection = useCallback(
    (sectionId: string, content: any) => {
      pushSnapshot(sections);
      updateSection(sectionId, content);
    },
    [sections, pushSnapshot, updateSection]
  );

  const handleAddSection = useCallback(
    (section: ResumeSection) => {
      pushSnapshot(sections);
      addSection(section);
      selectSection(section.id);
    },
    [sections, pushSnapshot, addSection, selectSection]
  );

  const handleRemoveSection = useCallback(
    (sectionId: string) => {
      pushSnapshot(sections);
      removeSection(sectionId);
    },
    [sections, pushSnapshot, removeSection]
  );

  const handleReorder = useCallback(
    (newSections: ResumeSection[]) => {
      pushSnapshot(sections);
      reorderSections(newSections);
    },
    [sections, pushSnapshot, reorderSections]
  );

  return {
    resume: currentResume,
    sections,
    updateSection: handleUpdateSection,
    addSection: handleAddSection,
    removeSection: handleRemoveSection,
    reorderSections: handleReorder,
    loadResume,
  };
}
