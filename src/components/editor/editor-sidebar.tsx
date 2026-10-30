'use client';

import { useCallback, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

function SortableSidebarItem({ section, isSelected, onSelect, icon: Icon }: { section: ResumeSection; isSelected: boolean; onSelect: () => void; icon: React.ElementType }) {
  const t = useTranslations('editor.sidebar');
  const fixed = section.type === 'personal_info';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id, disabled: fixed });
  return <div ref={setNodeRef} data-module-id={section.id} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? .4 : 1 }} className={cn('flex items-center gap-1 rounded-md px-1', isSelected ? 'bg-[var(--app-selection)]' : 'hover:bg-[var(--app-hover)]/60')}>
    {!fixed ? <button type="button" {...attributes} {...listeners} aria-label={t('drag', { title: section.title })} title={t('drag', { title: section.title })} className="flex size-6 shrink-0 touch-none cursor-grab items-center justify-center text-[var(--app-text-muted)]"><GripVertical className="size-3" /></button> : <span className="w-6 shrink-0" />}
    <button type="button" aria-pressed={isSelected} onClick={onSelect} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 text-left text-xs"><Icon className={cn('size-3.5 shrink-0', isSelected ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-muted)]')} /><span className="truncate">{section.title}</span></button>
  </div>;
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
  const ts = useTranslations('editor.sidebar');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const { selectedSectionId, selectSection } = useEditorStore();
  const { updateSectionTitle } = useResumeStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    setRenaming(false);
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

  const selected = sections.find(section => section.id === selectedSectionId) || sections[0];
  const selectedIndex = sections.findIndex(section => section.id === selected?.id);
  const fixed = !selected || selected.type === 'personal_info';
  const moveSelected = (delta: number) => {
    const index = selectedIndex + delta;
    if (fixed || index < 0 || index >= sections.length || sections[index].type === 'personal_info') return;
    const next = [...sections]; [next[selectedIndex], next[index]] = [next[index], next[selectedIndex]];
    onReorderSections(next.map((item, order) => ({ ...item, sortOrder: order })));
  };
  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-sidebar)] max-md:w-full max-md:border-r-0">
      <div className="p-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
          {t('sidebar.sections')}
        </h3>
        <p className="mt-1 text-[10px] leading-5 text-[var(--app-text-muted)]">{t('sidebar.hint')}</p>
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
              {sections.map((section) => {
                const Icon = sectionIcons[section.type] || LayoutList;
                return (
                  <SortableSidebarItem
                    key={section.id}
                    section={section}
                    isSelected={(selectedSectionId || sections[0]?.id) === section.id}
                    onSelect={() => handleSelect(section.id)}
                    icon={Icon}
                  />
                );
              })}
            </SortableContext>
            <DragOverlay>
              {activeSection && ActiveIcon && (
                <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm shadow-xl ring-1 ring-[var(--app-accent-soft)]/40 bg-[var(--app-surface)] cursor-grabbing opacity-95">
                  <GripVertical className="h-3 w-3 shrink-0 text-[var(--app-accent)]" />
                  <ActiveIcon className="h-4 w-4 shrink-0 text-[var(--app-text)]" />
                  <span className="truncate text-[var(--app-text)]">{activeSection.title}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {availableTypes.length > 0 && (
          <>
            <Separator className="my-3 bg-[var(--app-border)]" />
            <div className="px-2 pb-4">
              <p className="mb-2 px-2 text-xs text-[var(--app-text-muted)]">{t('sidebar.addSection')}</p>
              <div className="space-y-0.5">
                {availableTypes.map((type) => {
                  const Icon = sectionIcons[type] || LayoutList;
                  return (
                    <button
                      key={type}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--app-text-muted)] transition-colors duration-150 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
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
      {selected && <div className="shrink-0 space-y-2 border-t border-[var(--app-border)] p-3" data-module-actions={selected.id}>
        <p className="truncate text-[10px] text-[var(--app-text-muted)]">{selected.title}</p>
        {fixed ? <p className="text-[11px] leading-5 text-[var(--app-text-muted)]">个人信息固定在首位，无需调整顺序。</p> : renaming ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (renameValue.trim()) updateSectionTitle(selected.id,renameValue.trim()); setRenaming(false); }}><Input autoFocus value={renameValue} aria-label={ts('rename')} onChange={event => setRenameValue(event.target.value)} /><div className="flex gap-1"><Button type="button" variant="ghost" size="xs" onClick={() => setRenaming(false)}>取消</Button><Button size="xs">保存</Button></div></form> : <div className="grid grid-cols-2 gap-1">
          <Button variant="ghost" size="xs" disabled={fixed || selectedIndex < 1 || sections[selectedIndex - 1]?.type === 'personal_info'} aria-label={ts('moveUp',{title:selected.title})} onClick={() => moveSelected(-1)}><ArrowUp />上移</Button>
          <Button variant="ghost" size="xs" disabled={fixed || selectedIndex === sections.length - 1} aria-label={ts('moveDown',{title:selected.title})} onClick={() => moveSelected(1)}><ArrowDown />下移</Button>
          <Button variant="ghost" size="xs" disabled={fixed} onClick={() => { setRenameValue(selected.title); setRenaming(true); }}><Pencil />重命名</Button>
          <Button variant="ghost" size="xs" disabled={fixed} aria-label={ts('remove',{title:selected.title})} onClick={() => onRemoveSection(selected.id)}><Trash2 />{ts('removeLabel')}</Button>
        </div>}
      </div>}
    </div>
  );
}
