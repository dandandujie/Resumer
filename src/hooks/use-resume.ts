import { useState, useCallback } from 'react';
import * as api from '@/lib/tauri-api';
import type { Resume } from '@/types/resume';

export function useResume() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchResumes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.listResumes();
      setResumes(data as Resume[]);
    } catch (error) {
      console.error('Failed to fetch resumes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createResume = useCallback(async (data: Parameters<typeof api.createResume>[0]) => {
    const resumeId = await api.createResume(data);
    // Reload to get full resume with sections
    const resume = await api.getResume(resumeId);
    if (resume) {
      setResumes((prev) => [resume as Resume, ...prev]);
    }
    return resume;
  }, []);

  const deleteResume = useCallback(async (id: string) => {
    try {
      await api.deleteResume(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
      return true;
    } catch (error) {
      console.error('Failed to delete resume:', error);
    }
    return false;
  }, []);

  const renameResume = useCallback(async (id: string, title: string) => {
    try {
      await api.updateResume(id, { title });
      setResumes((prev) => prev.map((r) => r.id === id ? { ...r, title } : r));
      return true;
    } catch (error) {
      console.error('Failed to rename resume:', error);
    }
    return false;
  }, []);

  const duplicateResume = useCallback(async (id: string) => {
    try {
      const newId = await api.duplicateResume(id);
      const resume = await api.getResume(newId);
      if (resume) {
        setResumes((prev) => [resume as Resume, ...prev]);
      }
      return resume;
    } catch (error) {
      console.error('Failed to duplicate resume:', error);
    }
    return null;
  }, []);

  return {
    resumes,
    isLoading,
    fetchResumes,
    createResume,
    deleteResume,
    renameResume,
    duplicateResume,
  };
}
