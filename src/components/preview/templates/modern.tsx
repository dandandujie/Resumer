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
import { formatDateRange } from '@/lib/resume-date';
import { resolveTheme, type DateStyle } from '@/lib/theme-config';
import { AvatarImage } from '../avatar-image';
import { QrCodesPreview } from '../qr-codes-preview';
import { ItemBox } from '../item-box';
import { useEditorStore } from '@/stores/editor-store';
import { useProposalsStore } from '@/stores/proposals-store';
import { PreviewProposalOverlay } from '../preview-proposal-overlay';
import { cn } from '@/lib/utils';
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
  return formatDateRange(startDate, endDate, { current, style, lang });
}

function EmptySectionPlaceholder({ lang, dark }: { lang?: string; dark?: boolean }) {
  // On a dark zone (e.g. the sidebar) use a translucent card + light bars so the
  // placeholder reads as part of the dark panel instead of a jarring white card.
  return (
    <div
      className={cn(
        'rounded-md border border-dashed px-3 py-4',
        dark ? 'border-white/20 bg-white/5' : 'border-zinc-200 bg-zinc-50/70'
      )}
    >
      <div className={cn('h-2.5 w-24 rounded-full', dark ? 'bg-white/25' : 'bg-zinc-200/80')} />
      <div className={cn('mt-2 h-2.5 w-full max-w-[16rem] rounded-full', dark ? 'bg-white/15' : 'bg-zinc-100')} />
      <p className={cn('mt-3 text-xs', dark ? 'text-white/70' : 'text-[var(--resume-body-color)]')}>
        {lang === 'zh' ? '填写后会显示在这里' : 'Content will appear here'}
      </p>
    </div>
  );
}

export function ModernTemplate({ resume, interactive, onReorderSections }: { resume: Resume; interactive?: boolean; onReorderSections?: (sections: ResumeSection[]) => void }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;
  const theme = resolveTheme(resume.themeConfig);
  const isZh = resume.language !== 'en';
  const { selectedSectionId, selectSection } = useEditorStore();
  const pendingProposals = useProposalsStore((s) =>
    interactive ? s.proposals : null
  );

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

  // Modern template: left sidebar for personal + skills/languages, main content for work/edu/projects
  const leftSidebarTypes = new Set(['skills', 'languages', 'certifications', 'qr-codes']);
  const leftSections = resume.sections.filter((s) => s.visible && leftSidebarTypes.has(s.type) && (interactive || !isSectionEmpty(s)));
  const mainSections = resume.sections.filter((s) => s.visible && s.type !== 'personal_info' && !leftSidebarTypes.has(s.type) && (interactive || !isSectionEmpty(s)));

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

  const renderSection = (section: ResumeSection, compact = false) => (
    <PreviewSection
      key={section.id}
      section={section}
      dndEnabled={dndEnabled}
      interactive={interactive}
      sectionProps={getSectionProps(section.id)}
      lang={resume.language}
      pendingChange={pendingSectionChanges.get(section.id)}
      compact={compact}
      theme={theme}
    />
  );

  // Full personal-info field list (matches classic), shown as plain "label: value"
  // text lines — no icons — per the requested style.
  const personalFields: [keyof PersonalInfoContent, string][] = [
    ['age', isZh ? '年龄' : 'Age'],
    ['gender', isZh ? '性别' : 'Gender'],
    ['politicalStatus', isZh ? '政治面貌' : 'Political'],
    ['ethnicity', isZh ? '民族' : 'Ethnicity'],
    ['hometown', isZh ? '籍贯' : 'Hometown'],
    ['maritalStatus', isZh ? '婚姻状况' : 'Marital'],
    ['yearsOfExperience', isZh ? '工作年限' : 'Experience'],
    ['educationLevel', isZh ? '学历' : 'Education'],
    ['email', isZh ? '邮箱' : 'Email'],
    ['phone', isZh ? '电话' : 'Phone'],
    ['wechat', isZh ? '微信' : 'WeChat'],
    ['location', isZh ? '所在地' : 'Location'],
    ['website', isZh ? '网站' : 'Website'],
    ['linkedin', isZh ? '领英' : 'LinkedIn'],
    ['github', 'GitHub'],
  ];

  return (
    <div className="mx-auto max-w-[210mm] bg-white">
      <div className="grid grid-cols-[35%_65%] gap-0">
        {/* Left Sidebar - Personal Info + Skills/Languages.
            data-zone="dark" makes all text/headings inside render white (see
            the dark-zone CSS in resume-preview) so nothing merges into the bg. */}
        <div data-zone="dark" className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white">
          {/* Avatar + Name — avatar respects the configured style (circle / 1-inch)
              so its shape & size match the photo instead of forcing a circle. */}
          <div {...(personalInfo ? getSectionProps(personalInfo.id) : {})} className="text-center">
            {pi.avatar && (
              <AvatarImage
                src={pi.avatar}
                size={100}
                avatarStyle={theme.avatarStyle}
                className="mx-auto mb-4 block ring-4 ring-white/20"
              />
            )}
            <h1 className="mb-1 text-2xl font-bold tracking-tight">{pi.fullName || (isZh ? '姓名' : 'Your Name')}</h1>
            {pi.jobTitle && <p className="text-sm font-medium text-slate-300">{pi.jobTitle}</p>}
          </div>

          {/* Personal info — plain text labels, no icons */}
          <div className="mt-6 space-y-1.5 text-xs leading-relaxed text-slate-200">
            {personalFields.map(([key, label]) => {
              const val = pi[key] as string | undefined;
              if (!val) return null;
              return (
                <div key={key} className="break-words">
                  <span className="opacity-60">{label}{isZh ? '：' : ': '}</span>{val}
                </div>
              );
            })}
          </div>

          {/* Left Sidebar Sections */}
          <div className="mt-8 space-y-6">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={leftSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {leftSections.map((s) => renderSection(s, true))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Main Content - Summary + Work + Education + Projects */}
        <div className="p-8">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={mainSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-6">
                {mainSections.map((s) => renderSection(s))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

// Reuse the PreviewSection component from classic (needs to be extracted to shared file, but for now inline a simplified version)
function PreviewSection({
  section,
  dndEnabled,
  interactive,
  sectionProps,
  lang,
  pendingChange,
  compact = false,
  theme,
}: {
  section: ResumeSection;
  dndEnabled?: boolean;
  interactive?: boolean;
  sectionProps?: any;
  lang?: string;
  pendingChange?: 'added' | 'modified' | 'removed';
  compact?: boolean;
  theme: ReturnType<typeof resolveTheme>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: !dndEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const content = section.content as any;

  const sectionClasses = cn(
    'relative group',
    compact && 'text-sm',
    pendingChange === 'added' && 'ring-2 ring-green-400',
    pendingChange === 'modified' && 'ring-2 ring-blue-400',
    pendingChange === 'removed' && 'opacity-50 ring-2 ring-red-400'
  );

  const inner = (
    <div className={sectionClasses} {...sectionProps}>
      {interactive && dndEnabled && (
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-6 top-0 hidden cursor-grab p-1 text-[var(--resume-body-color)] hover:text-[var(--resume-body-color)] group-hover:block active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <h3 className={cn("font-bold", compact ? "text-xs mb-2 text-white/90" : "text-sm mb-3 text-[var(--resume-body-color)] border-b-2 border-zinc-300 pb-1")}>
        {section.title}
      </h3>

      {!content || (isSectionEmpty(section) && interactive) ? (
        <EmptySectionPlaceholder lang={lang} dark={compact} />
      ) : (
        <div className={compact ? "text-white/80 space-y-2" : "space-y-3"}>
          {section.type === 'summary' && (
            <div className="text-sm leading-relaxed text-[var(--resume-body-color)]" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text || '') }} />
          )}
          {section.type === 'work_experience' && (
            (content as WorkExperienceContent).items?.map((item: any) => (
              <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive} className={compact ? "space-y-0.5" : "space-y-1"}>
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{item.position}</span>
                  <span className={cn("text-xs", compact ? "text-white/60" : "text-[var(--resume-body-color)]")}>{getDateRange(item.startDate, item.endDate, Boolean(item.current), theme.dateStyle, lang)}</span>
                </div>
                <div className={cn("text-xs", compact ? "text-white/70" : "text-[var(--resume-body-color)]")}>{item.company}{item.location && ` · ${item.location}`}</div>
                {item.description && <div className="text-xs text-[var(--resume-body-color)]" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
                {item.highlights && item.highlights.length > 0 && (
                  <ul className="ml-4 list-disc space-y-0.5 text-xs text-[var(--resume-body-color)]">
                    {item.highlights.map((h: string, i: number) => <li key={i} dangerouslySetInnerHTML={{ __html: md(h) }} />)}
                  </ul>
                )}
              </ItemBox>
            ))
          )}
          {section.type === 'education' && (
            (content as EducationContent).items?.map((item: any) => (
              <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive} className="space-y-0.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-sm">{item.degree}</span>
                  <span className={cn("text-xs", compact ? "text-white/60" : "text-[var(--resume-body-color)]")}>{getDateRange(item.startDate, item.endDate, Boolean(item.current), theme.dateStyle, lang)}</span>
                </div>
                <div className={cn("text-xs", compact ? "text-white/70" : "text-[var(--resume-body-color)]")}>{item.institution}{item.field && ` · ${item.field}`}</div>
              </ItemBox>
            ))
          )}
          {section.type === 'skills' && (
            (content as SkillsContent).categories?.map((cat: any) => (
              <div key={cat.id} className="space-y-1">
                <div className={cn("font-semibold text-xs", compact ? "text-white/90" : "text-[var(--resume-body-color)]")}>{cat.name}</div>
                <div className={cn("flex flex-wrap gap-1.5", compact && "text-xs")}>
                  {cat.skills?.map((skill: string, i: number) => (
                    <span key={i} className={cn("rounded px-2 py-0.5 text-xs font-medium", compact ? "bg-white/10 text-white/80" : "bg-zinc-100 text-[var(--resume-body-color)]")}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
          {section.type === 'projects' && (
            (content as ProjectsContent).items?.map((item: any) => (
              <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive} className="space-y-1">
                <div className="font-semibold text-sm">{item.name}</div>
                {item.description && <div className="text-xs text-[var(--resume-body-color)]" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
                {item.technologies && item.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.technologies.map((tech: string, i: number) => (
                      <span key={i} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-[var(--resume-body-color)]">{tech}</span>
                    ))}
                  </div>
                )}
              </ItemBox>
            ))
          )}
          {section.type === 'languages' && (
            (content as LanguagesContent).items?.map((item: any) => (
              <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive} className="flex items-baseline justify-between text-xs">
                <span className="font-medium">{item.language}</span>
                <span className={compact ? "text-white/60" : "text-[var(--resume-body-color)]"}>{item.proficiency}</span>
              </ItemBox>
            ))
          )}
          {section.type === 'certifications' && (
            (content as CertificationsContent).items?.map((item: any) => (
              <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive} className="space-y-0.5">
                <div className="font-semibold text-sm">{item.name}</div>
                <div className={cn("text-xs", compact ? "text-white/70" : "text-[var(--resume-body-color)]")}>{item.issuer}{item.date && ` · ${item.date}`}</div>
              </ItemBox>
            ))
          )}
          {section.type === 'custom' && (
            (content as CustomContent).items?.map((item: any) => (
              <ItemBox key={item.id} sectionId={section.id} itemId={item.id} interactive={interactive} className="space-y-1">
                <div className="font-semibold text-sm">{item.title}</div>
                {item.subtitle && <div className="text-xs text-[var(--resume-body-color)]">{item.subtitle}</div>}
                {item.description && <div className="text-sm text-[var(--resume-body-color)]" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
              </ItemBox>
            ))
          )}
          {section.type === 'qr-codes' && <QrCodesPreview items={(content as any).items || []} svgs={(content as any)._qrSvgs} />}
          {section.type === 'github' && (
            <div className="space-y-2">
              {(content as GitHubContent).items?.map((repo: any) => (
                <div key={repo.id} className="space-y-1">
                  <div className="font-semibold text-sm">{repo.name}</div>
                  {repo.description && <div className="text-xs text-[var(--resume-body-color)]">{repo.description}</div>}
                  <div className="flex items-center gap-3 text-[10px] text-[var(--resume-body-color)]">
                    {repo.language && <span>● {repo.language}</span>}
                    {repo.stars != null && <span>⭐ {repo.stars}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingChange && <PreviewProposalOverlay sectionId={section.id} />}
    </div>
  );

  if (dndEnabled) {
    return <div ref={setNodeRef} style={style}>{inner}</div>;
  }
  return inner;
}
