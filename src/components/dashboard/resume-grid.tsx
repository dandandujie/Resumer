'use client';

import type { Resume } from '@/types/resume';
import { ResumeCard } from './resume-card';

interface ResumeGridProps {
  resumes: Resume[];
  onDelete: (id: string) => Promise<boolean>;
  onDuplicate: (id: string) => Promise<Resume | null>;
  onRename: (id: string, title: string) => Promise<boolean>;
}

export function ResumeGrid({ resumes, onDelete, onDuplicate, onRename }: ResumeGridProps) {
  return (
    <div className="app-resume-grid">
      {resumes.map((resume) => (
        <ResumeCard
          key={resume.id}
          resume={resume}
          onDelete={() => onDelete(resume.id)}
          onDuplicate={() => onDuplicate(resume.id)}
          onRename={(title) => onRename(resume.id, title)}
        />
      ))}
    </div>
  );
}
