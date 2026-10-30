'use client';

import { useCallback, useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import type {
  Resume,
  ResumeSection,
  PersonalInfoContent,
  SummaryContent,
  WorkExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
  CertificationsContent,
  LanguagesContent,
  CustomContent,
  GitHubContent,
} from '@/types/resume';
import { isSectionEmpty, md } from '../utils';
import { formatDateRange, formatMonth } from '@/lib/resume-date';
import { resolveTheme, type DateStyle } from '@/lib/theme-config';
import { AvatarImage } from '../avatar-image';
import { QrCodesPreview } from '../qr-codes-preview';
import { InlineText } from '../inline-text';
import { ItemBox } from '../item-box';
import { useEditorStore } from '@/stores/editor-store';
import { useProposalsStore } from '@/stores/proposals-store';
import { PreviewProposalOverlay } from '../preview-proposal-overlay';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function getDateRange(startDate?: string, endDate?: string | null, current = false, style: DateStyle = 'dot', lang = 'zh') {
  return <InlineText>{formatDateRange(startDate, endDate, { current, style, lang })}</InlineText>;
}

function EmptySectionPlaceholder({ lang }: { lang?: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/70 px-3 py-4">
      <div className="h-2.5 w-24 rounded-full bg-zinc-200/80" />
      <div className="mt-2 h-2.5 w-full max-w-[16rem] rounded-full bg-zinc-100" />
      <p className="mt-3 text-xs text-[var(--resume-body-color)]">
        {lang === 'zh' ? '填写后会显示在这里' : 'Content will appear here'}
      </p>
    </div>
  );
}

export function ClassicTemplate({ resume, interactive, onReorderSections }: { resume: Resume; interactive?: boolean; onReorderSections?: (sections: ResumeSection[]) => void }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;
  const theme = resolveTheme(resume.themeConfig);
  const isZh = resume.language !== 'en';
  const { selectedSectionId, selectSection } = useEditorStore();
  const pendingProposals = useProposalsStore((s) =>
    interactive ? s.proposals : null
  );

  /** sectionId → 'added' | 'modified' | 'removed' for any pending proposal */
  const pendingSectionChanges = useMemo(() => {
    const map = new Map<string, 'added' | 'modified' | 'removed'>();
    if (!pendingProposals || pendingProposals.length === 0) return map;
    for (const p of pendingProposals) {
      const beforeMap = new Map(p.beforeSections.map((s) => [s.id, s]));
      const afterMap = new Map(p.afterSections.map((s) => [s.id, s]));
      for (const a of p.afterSections) {
        const b = beforeMap.get(a.id);
        if (!b) {
          map.set(a.id, 'added');
        } else if (JSON.stringify(b.content) !== JSON.stringify(a.content) || b.title !== a.title) {
          if (map.get(a.id) !== 'added') map.set(a.id, 'modified');
        }
      }
      for (const b of p.beforeSections) {
        if (!afterMap.has(b.id)) {
          map.set(b.id, 'removed');
        }
      }
    }
    return map;
  }, [pendingProposals]);

  const getSectionProps = (sectionId: string) => {
    if (!interactive) return {};
    const isSelected = selectedSectionId === sectionId;
    return {
      onClick: () => selectSection(sectionId),
      className: cn(
        'transition-all duration-200 cursor-pointer p-2 -mx-2 rounded-lg',
        isSelected ? 'bg-brand/5 ring-1 ring-brand/20' : 'hover:bg-zinc-50'
      )
    };
  };

  const displayedSections = resume.sections.filter(
    (s) => s.visible && s.type !== 'personal_info' && (interactive || !isSectionEmpty(s))
  );

  const dndEnabled = !!(interactive && onReorderSections);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorderSections) return;
      const oldIndex = resume.sections.findIndex((s) => s.id === active.id);
      const newIndex = resume.sections.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const newSections = [...resume.sections];
      const [removed] = newSections.splice(oldIndex, 1);
      newSections.splice(newIndex, 0, removed);
      onReorderSections(newSections.map((s, i) => ({ ...s, sortOrder: i })));
    },
    [resume.sections, onReorderSections]
  );

  const renderSection = (section: ResumeSection) => (
    <PreviewSection
      key={section.id}
      section={section}
      dndEnabled={dndEnabled}
      interactive={interactive}
      sectionProps={getSectionProps(section.id)}
      lang={resume.language}
      pendingChange={pendingSectionChanges.get(section.id)}
      theme={theme}
    />
  );

  return (
    <div className="mx-auto max-w-[210mm] bg-white">
      {/* Header — margin-bottom driven by the section-spacing setting (data-section)
          instead of a fixed mb-6, so the gap to the first section stays tight. */}
      <div className="border-b-2 border-[var(--resume-accent-color)] pb-2" data-section data-section-id={personalInfo?.id}>
        <div {...(personalInfo ? getSectionProps(personalInfo.id) : {})}>
          <div className="flex items-center justify-center gap-4" data-personal-heading>
            {pi.avatar && (
              <AvatarImage src={pi.avatar} avatarStyle={theme.avatarStyle} size={64} className="shrink-0" />
            )}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[var(--resume-body-color)]" data-field="fullName"><InlineText>{pi.fullName || (isZh ? '姓名' : 'Your Name')}</InlineText></h1>
              {pi.jobTitle && <p className="mt-1 text-lg text-[var(--resume-body-color)]" data-field="jobTitle"><InlineText>{pi.jobTitle}</InlineText></p>}
            </div>
          </div>
          <div className={cn('mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-sm text-[var(--resume-body-color)]', theme.infoLayout === 'grid' ? 'grid grid-cols-2' : 'items-center')}>
            {pi.age && <span data-field="age"><InlineText>{pi.age}</InlineText></span>}
            {pi.politicalStatus && <span data-field="politicalStatus"><InlineText>{pi.politicalStatus}</InlineText></span>}
            {pi.gender && <span data-field="gender"><InlineText>{pi.gender}</InlineText></span>}
            {pi.ethnicity && <span data-field="ethnicity"><InlineText>{pi.ethnicity}</InlineText></span>}
            {pi.hometown && <span data-field="hometown"><InlineText>{pi.hometown}</InlineText></span>}
            {pi.maritalStatus && <span data-field="maritalStatus"><InlineText>{pi.maritalStatus}</InlineText></span>}
            {pi.yearsOfExperience && <span data-field="yearsOfExperience"><InlineText>{pi.yearsOfExperience}</InlineText></span>}
            {pi.educationLevel && <span data-field="educationLevel"><InlineText>{pi.educationLevel}</InlineText></span>}
            {pi.email && <span data-field="email"><InlineText>{pi.email}</InlineText></span>}
            {pi.phone && <span data-field="phone"><InlineText>{pi.phone}</InlineText></span>}
            {pi.wechat && <span data-field="wechat"><InlineText>{pi.wechat}</InlineText></span>}
            {pi.location && <span data-field="location"><InlineText>{pi.location}</InlineText></span>}
            {pi.website && <span data-field="website"><InlineText>{pi.website}</InlineText></span>}
            {pi.linkedin && <InlineText field="linkedin">{pi.linkedin}</InlineText>}
            {pi.github && <InlineText field="github">{pi.github}</InlineText>}
            {pi.customLinks?.map((link, index) => <span key={index}><InlineText field={`customLinks.${index}.label`}>{link.label}</InlineText>{link.label && ': '}<InlineText field={`customLinks.${index}.url`}>{link.url}</InlineText></span>)}
          </div>
        </div>
      </div>

      {/* Sections */}
      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayedSections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {displayedSections.map(renderSection)}
          </SortableContext>
        </DndContext>
      ) : (
        displayedSections.map(renderSection)
      )}
    </div>
  );
}

function PreviewSection({
  section,
  dndEnabled,
  interactive,
  sectionProps,
  lang,
  pendingChange,
  theme,
}: {
  section: ResumeSection;
  dndEnabled: boolean;
  interactive?: boolean;
  sectionProps: Record<string, any>;
  lang?: string;
  pendingChange?: 'added' | 'modified' | 'removed';
  theme: ReturnType<typeof resolveTheme>;
}) {
  const sortable = useSortable({ id: section.id, disabled: !dndEnabled });
  const style = dndEnabled
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.6 : 1,
        zIndex: sortable.isDragging ? 50 : undefined,
        position: sortable.isDragging ? ('relative' as const) : undefined,
      }
    : undefined;

  const pendingRingClass =
    pendingChange === 'added'
      ? 'rounded-lg ring-1 ring-[var(--app-accent)]/30'
      : pendingChange === 'removed'
        ? 'rounded-lg ring-1 ring-red-300/60'
        : pendingChange === 'modified'
          ? 'rounded-lg ring-1 ring-amber-300/60'
          : '';

  const content = (
    <div className={cn('group/section relative', pendingRingClass && `p-2 -mx-2 ${pendingRingClass}`)} {...sectionProps}>
      {pendingChange && <PreviewProposalOverlay sectionId={section.id} />}
      {dndEnabled && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="absolute -left-7 top-1/2 -translate-y-1/2 hidden cursor-grab rounded p-1 text-[var(--resume-body-color)] hover:text-brand active:cursor-grabbing group-hover/section:flex"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <h2 className="mb-2 border-b border-zinc-300 pb-1 text-sm font-bold text-[var(--resume-body-color)]">
        {section.title}
      </h2>
      <SectionContent section={section} lang={lang} interactive={interactive} theme={theme} />
    </div>
  );

  if (dndEnabled) {
    return (
      <div ref={sortable.setNodeRef} style={style} className="mb-5" data-section data-section-id={section.id}>
        {content}
      </div>
    );
  }

  if (!interactive) {
    return (
      <div className="mb-5" data-section data-section-id={section.id}>
        {content}
      </div>
    );
  }
  return (
    <motion.div
      className="mb-5"
      data-section
      data-section-id={section.id}
      layout="position"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {content}
    </motion.div>
  );
}

function SectionContent({ section, lang, interactive, theme }: { section: any; lang?: string; interactive?: boolean; theme: ReturnType<typeof resolveTheme> }) {
  const content = section.content;
  if (!content) return null;
  const empty = isSectionEmpty(section);

  if (interactive && empty) {
    return <EmptySectionPlaceholder lang={lang} />;
  }

  if (section.type === 'summary') {
    return <p className="text-sm text-[var(--resume-body-color)] leading-relaxed" data-field="text" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-[var(--resume-body-color)]" data-field="position"><InlineText>{item.position}</InlineText></span>
              </div>
              <div className="min-w-0 text-center">
                <span className="inline-flex flex-wrap items-baseline justify-center gap-x-1.5">
                {item.company && <span className="text-sm font-semibold text-[var(--resume-body-color)]" data-field="company"><InlineText field="company">{item.company}</InlineText></span>}
                {item.location && <span className="text-xs text-[var(--resume-body-color)]" data-field="location"><InlineText>{item.location}</InlineText></span>}
                </span>
              </div>
              <div className="min-w-0 text-right">
                <span className="text-xs font-semibold text-[var(--resume-body-color)]" data-field="startDate endDate">
                  {getDateRange(item.startDate, item.endDate, item.current, theme.dateStyle, lang)}
                </span>
              </div>
            </div>
            {item.description && <p className="mt-1 text-sm text-[var(--resume-body-color)]" data-field="description" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs font-medium text-[var(--resume-body-color)]" data-field="technologies"><span className="font-semibold text-[var(--resume-body-color)]">{lang === 'zh' ? '技术栈' : 'Tech'}:</span> {item.technologies.map((tech: string, i: number) => <span key={i}>{i > 0 && ', '}<InlineText field={`technologies.${i}`}>{tech}</InlineText></span>)}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-[var(--resume-body-color)]" data-field={`highlights.${i}`} dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'education') {
    const items = (content as EducationContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-semibold text-[var(--resume-body-color)]" >
                  {(['institution', 'field', 'degree'] as const).filter((key) => item[key]).map((key, i) => <span key={key}>{i > 0 && ' - '}<InlineText field={key}>{item[key]}</InlineText></span>)}
                </span>
                {item.location && <span className="text-sm text-[var(--resume-body-color)]"> , <InlineText field="location">{item.location}</InlineText></span>}
              </div>
              <span className="text-xs font-semibold text-[var(--resume-body-color)]" data-field="startDate endDate">
                {getDateRange(item.startDate, item.endDate, Boolean(item.current), theme.dateStyle, lang)}
              </span>
            </div>
            {item.gpa && <p className="text-sm text-[var(--resume-body-color)]" >GPA: <InlineText field="gpa">{item.gpa}</InlineText></p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-[var(--resume-body-color)]" data-field={`highlights.${i}`} dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-1">
        {categories.map((cat: any) => (
          <div key={cat.id} className="flex text-sm" data-item-id={cat.id}>
            <span className="font-medium text-[var(--resume-body-color)] w-28 shrink-0" data-field="name"><InlineText>{cat.name}</InlineText>:</span>
            <span className="text-[var(--resume-body-color)]" data-field="skills">{cat.skills?.map((skill: string, i: number) => <span key={i}>{i > 0 && ', '}<InlineText field={`skills.${i}`}>{skill}</InlineText></span>)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'projects') {
    const items = (content as ProjectsContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-[var(--resume-body-color)] text-sm" data-field="name"><InlineText>{item.name}</InlineText></span>
              {item.startDate && (
                <span className="text-xs font-semibold text-[var(--resume-body-color)]" data-field="startDate endDate">
                  {getDateRange(item.startDate, item.endDate, Boolean(item.current), theme.dateStyle, lang)}
                </span>
              )}
            </div>
            {item.url && <div className="text-xs"><InlineText field="url">{item.url}</InlineText></div>}
            {item.description && <p className="mt-1 text-sm text-[var(--resume-body-color)]" data-field="description" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs font-medium text-[var(--resume-body-color)]" data-field="technologies"><span className="font-semibold text-[var(--resume-body-color)]">{lang === 'zh' ? '技术栈' : 'Tech'}:</span> {item.technologies.map((tech: string, i: number) => <span key={i}>{i > 0 && ', '}<InlineText field={`technologies.${i}`}>{tech}</InlineText></span>)}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-[var(--resume-body-color)]" data-field={`highlights.${i}`} dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-[var(--resume-body-color)] text-sm" data-field="name"><InlineText>{item.name}</InlineText></span>
              <span className="text-xs text-[var(--resume-body-color)]">{item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs text-[var(--resume-body-color)]"><InlineText>{item.language}</InlineText></span>}
            {item.repoUrl && <div className="text-xs"><InlineText field="repoUrl">{item.repoUrl}</InlineText></div>}
            {item.description && <p className="mt-1 text-sm text-[var(--resume-body-color)]" data-field="description" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'certifications') {
    const items = (content as CertificationsContent).items || [];
    return (
      <div className="space-y-1">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <span className="font-semibold text-[var(--resume-body-color)] text-sm" data-field="name"><InlineText>{item.name}</InlineText></span>
            {(item.issuer || item.date) && <span className="text-sm text-[var(--resume-body-color)]" >{item.issuer && <> — <InlineText field="issuer">{item.issuer}</InlineText></>}{item.date && <> (<InlineText field="date">{formatMonth(item.date, theme.dateStyle, lang)}</InlineText>)</>}</span>}
            {item.url && <div className="text-xs"><InlineText field="url">{item.url}</InlineText></div>}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    const items = (content as LanguagesContent).items || [];
    return (
      <div className="space-y-1">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <span className="font-semibold text-[var(--resume-body-color)] text-sm" data-field="language"><InlineText>{item.language}</InlineText></span>
            <span className="text-sm text-[var(--resume-body-color)]" > — <InlineText field="proficiency">{item.proficiency}</InlineText></span>
            {item.description && <div className="text-xs"><InlineText field="description">{item.description}</InlineText></div>}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    const items = (content as CustomContent).items || [];
    return (
      <div className="space-y-2">
        {items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-semibold text-[var(--resume-body-color)]" data-field="title"><InlineText>{item.title}</InlineText></span>
                {item.subtitle && <span className="text-sm text-[var(--resume-body-color)]" > — <InlineText field="subtitle">{item.subtitle}</InlineText></span>}
              </div>
              {item.date && <span className="text-xs text-[var(--resume-body-color)]" data-field="date"><InlineText field="date">{formatMonth(item.date, theme.dateStyle, lang)}</InlineText></span>}
            </div>
            {item.description && <p className="mt-0.5 text-sm text-[var(--resume-body-color)]" data-field="description" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </ItemBox>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} svgs={(content as any)._qrSvgs} />;
  }

  // Generic items
  if (content?.items) {
    return (
      <div className="space-y-2">
        {content.items.map((item: any) => (
          <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive}>
            <span className="text-sm font-medium text-[var(--resume-body-color)]">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm text-[var(--resume-body-color)]" data-field="description" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </ItemBox>
        ))}
      </div>
    );
  }

  return null;
}
