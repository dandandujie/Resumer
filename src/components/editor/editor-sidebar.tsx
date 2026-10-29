'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, GripVertical, User, FileText, Briefcase, GraduationCap, Wrench, FolderKanban, Award, Languages, LayoutList, Pencil, Github, QrCode, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { generateId, cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import type { ResumeSection } from '@/types/resume';
import { SECTION_TYPES, type SectionType } from '@/lib/constants';

const sectionIcons: Record<string, React.ElementType> = {
  personal_info: User,
  summary: FileText,
  work_experience: Briefcase,
  education: GraduationCap,
  skills: Wrench,
  projects: FolderKanban,
  certifications: Award,
  languages: Languages,
  github: Github,
  qr_codes: QrCode,
  custom: LayoutList,
};

function SortableSidebarItem({ section, isSelected, onSelect, onRename, onRemove, onMove, first, last, icon: Icon }: {
  section: ResumeSection;
  isSelected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  first: boolean;
  last: boolean;
  icon: React.ElementType;
}) {
  const t = useTranslations('editor.sidebar');
  const fixed = section.type === 'personal_info';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: fixed });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(section.title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isRenaming) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [isRenaming]);
  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== section.title) onRename(trimmed);
    setIsRenaming(false);
  };
  const actionClass = 'inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] disabled:cursor-default disabled:opacity-30';
  return (
    <div ref={setNodeRef} data-module-id={section.id}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={cn('rounded-lg border p-2', isSelected ? 'border-[var(--whale-mint-deep)] bg-[var(--whale-card)] shadow-sm' : 'border-transparent hover:bg-[var(--whale-cream-soft)]')}>
      <div className="flex items-center gap-1">
        {!fixed && <button type="button" {...attributes} {...listeners} aria-label={t('drag', { title: section.title })} title={t('drag', { title: section.title })} className="flex h-7 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded text-[var(--whale-ink-muted)] hover:bg-[var(--whale-cream-deep)] active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>}
        {isRenaming ? <input ref={inputRef} aria-label={t('rename')} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === 'Enter') commitRename(); if (event.key === 'Escape') setIsRenaming(false); }} className="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-sm" /> :
          <button type="button" onClick={onSelect} aria-pressed={isSelected} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-medium text-[var(--whale-ink)]"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{section.title}</span></button>}
      </div>
      {!fixed && <div className="mt-1 flex items-center justify-between border-t border-[var(--whale-divider)] pt-1">
        <button type="button" className={actionClass} disabled={first} onClick={() => onMove(-1)} aria-label={t('moveUp', { title: section.title })} title={t('moveUp', { title: section.title })}><ArrowUp className="h-3.5 w-3.5" /></button>
        <button type="button" className={actionClass} disabled={last} onClick={() => onMove(1)} aria-label={t('moveDown', { title: section.title })} title={t('moveDown', { title: section.title })}><ArrowDown className="h-3.5 w-3.5" /></button>
        <button type="button" className={actionClass} onClick={() => { setRenameValue(section.title); setIsRenaming(true); }} aria-label={t('rename')} title={t('rename')}><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" className={cn(actionClass, 'px-1 text-xs hover:text-red-600')} onClick={onRemove} aria-label={t('remove', { title: section.title })}><Trash2 className="h-3.5 w-3.5" />{t('removeLabel')}</button>
      </div>}
    </div>
  );
}

interface EditorSidebarProps {
  sections: ResumeSection[];
  onAddSection: (section: ResumeSection) => void;
  onReorderSections: (sections: ResumeSection[]) => void;
  onRemoveSection: (sectionId: string) => void;
  onSectionSelect?: () => void;
}

export function EditorSidebar({ sections, onAddSection, onReorderSections, onRemoveSection, onSectionSelect }: EditorSidebarProps) {
  const t = useTranslations('editor');
  const { selectedSectionId, selectSection } = useEditorStore();
  const { updateSectionTitle } = useResumeStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    selectSection(id);
    useEditorStore.setState({ showThemeEditor: false, rightPaneTab: 'edit' });
    onSectionSelect?.();
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-section-id="${id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [selectSection, onSectionSelect]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      
      if (over && active.id !== over.id) {
        const oldIndex = sections.findIndex((s) => s.id === active.id);
        const newIndex = sections.findIndex((s) => s.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1 && sections[newIndex].type !== 'personal_info') {
          const newSections = [...sections];
          const [removed] = newSections.splice(oldIndex, 1);
          newSections.splice(newIndex, 0, removed);
          const reordered = newSections.map((s, i) => ({ ...s, sortOrder: i }));
          onReorderSections(reordered);
        }
      }
    },
    [sections, onReorderSections]
  );

  const activeSection = activeId ? sections.find((s) => s.id === activeId) : null;
  const ActiveIcon = activeSection ? (sectionIcons[activeSection.type] || LayoutList) : null;

  const sectionTypeLabels: Record<string, string> = {
    personal_info: t('sections.personalInfo'),
    summary: t('sections.summary'),
    work_experience: t('sections.workExperience'),
    education: t('sections.education'),
    skills: t('sections.skills'),
    projects: t('sections.projects'),
    certifications: t('sections.certifications'),
    languages: t('sections.languages'),
    github: t('sections.github'),
    qr_codes: t('sections.qrCodes'),
    custom: t('sections.custom'),
  };

  const existingTypes = new Set(sections.map((s) => s.type));
  const availableTypes = SECTION_TYPES.filter((type) => {
    if (type === 'custom') return true;
    return !existingTypes.has(type);
  });

  const handleAddSection = (type: SectionType) => {
    const newSection: ResumeSection = {
      id: generateId(),
      resumeId: '',
      type,
      title: sectionTypeLabels[type] || type,
      sortOrder: sections.length,
      visible: true,
      content: type === 'personal_info'
        ? { fullName: '', jobTitle: '', email: '', phone: '', location: '' }
        : type === 'summary'
          ? { text: '' }
          : type === 'skills'
            ? { categories: [] }
            : { items: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    onAddSection(newSection);
    useEditorStore.setState({ showThemeEditor: false, rightPaneTab: 'edit' });
  };

  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-[var(--whale-divider)] bg-[var(--whale-sidebar)] max-md:w-full max-md:border-r-0">
      <div className="p-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--whale-ink-muted)]">
          {t('sidebar.sections')}
        </h3>
        <p className="mt-2 text-xs leading-5 text-[var(--whale-ink-muted)]">{t('sidebar.hint')}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 px-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section, index) => {
                const Icon = sectionIcons[section.type] || LayoutList;
                return (
                  <SortableSidebarItem
                    key={section.id}
                    section={section}
                    isSelected={selectedSectionId === section.id}
                    onSelect={() => handleSelect(section.id)}
                    onRename={(title) => updateSectionTitle(section.id, title)}
                    onRemove={() => onRemoveSection(section.id)}
                    first={index === 0 || sections[index - 1]?.type === 'personal_info'}
                    last={index === sections.length - 1}
                    onMove={(delta) => {
                      const next = [...sections];
                      [next[index], next[index + delta]] = [next[index + delta], next[index]];
                      onReorderSections(next.map((item, order) => ({ ...item, sortOrder: order })));
                    }}
                    icon={Icon}
                  />
                );
              })}
            </SortableContext>
            <DragOverlay>
              {activeSection && ActiveIcon && (
                <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm shadow-xl ring-1 ring-[var(--whale-mint)]/40 bg-[var(--whale-card)] cursor-grabbing opacity-95">
                  <GripVertical className="h-3 w-3 shrink-0 text-[var(--whale-mint-deep)]" />
                  <ActiveIcon className="h-4 w-4 shrink-0 text-[var(--whale-ink)]" />
                  <span className="truncate text-[var(--whale-ink)]">{activeSection.title}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {availableTypes.length > 0 && (
          <>
            <Separator className="my-3 bg-[var(--whale-divider)]" />
            <div className="px-2 pb-4">
              <p className="mb-2 px-2 text-xs text-[var(--whale-ink-muted)]">{t('sidebar.addSection')}</p>
              <div className="space-y-0.5">
                {availableTypes.map((type) => {
                  const Icon = sectionIcons[type] || LayoutList;
                  return (
                    <button
                      key={type}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--whale-ink-muted)] transition-colors duration-150 hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
                      onClick={() => handleAddSection(type)}
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{sectionTypeLabels[type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  );
}
