'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Eye, EyeOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import type { ResumeSection, SectionContent } from '@/types/resume';
import { PersonalInfoSection } from './sections/personal-info';
import { SummarySection } from './sections/summary';
import { WorkExperienceSection } from './sections/work-experience';
import { EducationSection } from './sections/education';
import { SkillsSection } from './sections/skills';
import { ProjectsSection } from './sections/projects';
import { CertificationsSection } from './sections/certifications';
import { LanguagesSection } from './sections/languages';
import { CustomSection } from './sections/custom-section';
import { GitHubSection } from './sections/github';
import { QrCodesSection } from './sections/qr-codes';
import { FieldScopeProvider } from './fields/field-scope';

interface SectionWrapperProps {
  section: ResumeSection;
  onUpdate: (content: Partial<SectionContent>) => void;
  onRemove: () => void;
}

const sectionComponents: Record<string, React.ComponentType<{ section: ResumeSection; onUpdate: (content: any) => void }>> = {
  personal_info: PersonalInfoSection,
  summary: SummarySection,
  work_experience: WorkExperienceSection,
  education: EducationSection,
  skills: SkillsSection,
  projects: ProjectsSection,
  certifications: CertificationsSection,
  languages: LanguagesSection,
  github: GitHubSection,
  qr_codes: QrCodesSection,
  custom: CustomSection,
};

export function SectionWrapper({ section, onUpdate, onRemove }: SectionWrapperProps) {
  const t = useTranslations('editor');
  const { selectedSectionId, selectSection, setRightPaneTab, setPendingAiMessage } = useEditorStore();
  const { toggleSectionVisibility, updateSectionTitle } = useResumeStore();
  const isSelected = selectedSectionId === section.id;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(section.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== section.title) {
      updateSectionTitle(section.id, trimmed);
    } else {
      setRenameValue(section.title);
    }
    setIsRenaming(false);
  };

  const SectionComponent = sectionComponents[section.type];
  const isRenamable = section.type !== 'personal_info';

  return (
    <div
      className={`rounded-xl border bg-card shadow-sm transition-all duration-200 ${
        isSelected ? 'border-brand shadow-brand-muted/50' : 'border-border hover:border-[var(--whale-ink)]/30'
      } ${!section.visible ? 'opacity-50' : ''}`}
      onClick={() => selectSection(section.id)}
    >
      <div className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setRenameValue(section.title); setIsRenaming(false); }
              }}
              className="h-6 w-32 rounded border border-brand bg-transparent px-1 text-sm font-semibold text-[var(--whale-ink-soft)] outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h3
              className={`text-sm font-semibold text-[var(--whale-ink-soft)] ${isRenamable ? 'cursor-text rounded px-1 -mx-1 hover:bg-muted' : ''}`}
              onDoubleClick={isRenamable ? (e) => { e.stopPropagation(); setRenameValue(section.title); setIsRenaming(true); } : undefined}
            >
              {section.title}
            </h3>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0 text-brand hover:text-brand"
            title={t('aiPolish')}
            onClick={(e) => {
              e.stopPropagation();
              // Route to AI assistant tab + seed with a polish prompt
              setRightPaneTab('ai');
              setPendingAiMessage({ text: `请帮我润色「${section.title}」这个模块的内容` });
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0"
            title={section.visible ? t('sidebar.hide') : t('sidebar.show')}
            aria-label={section.visible ? t('sidebar.hide') : t('sidebar.show')}
            onClick={(e) => {
              e.stopPropagation();
              toggleSectionVisibility(section.id);
            }}
          >
            {section.visible ? (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          {section.type !== 'personal_info' && <Button
            variant="ghost"
            size="sm"
            title={t('sidebar.remove', { title: section.title })}
            aria-label={t('sidebar.remove', { title: section.title })}
            className="h-7 w-7 cursor-pointer p-0 text-muted-foreground hover:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>}
        </div>
      </div>
      <div className="px-4 pb-4 pt-3">
        {!section.content || typeof section.content !== 'object' ? (
          <p className="text-sm text-red-400">{t('invalidSectionContent')}</p>
        ) : SectionComponent ? (
          <FieldScopeProvider sectionId={section.id} itemId={null}>
            <SectionComponent section={section} onUpdate={onUpdate} />
          </FieldScopeProvider>
        ) : (
          <p className="text-sm text-muted-foreground">Unknown section type: {section.type}</p>
        )}
      </div>
    </div>
  );
}
