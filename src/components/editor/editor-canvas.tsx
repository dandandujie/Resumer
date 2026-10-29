'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionWrapper } from './section-wrapper';
import { TextFormatBar } from './text-format-bar';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection, SectionContent } from '@/types/resume';

interface EditorCanvasProps {
  sections: ResumeSection[];
  onUpdateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  onRemoveSection: (sectionId: string) => void;
}

export function EditorCanvas({
  sections,
  onUpdateSection,
  onRemoveSection,
}: EditorCanvasProps) {
  const { selectedSectionId } = useEditorStore();
  
  const displaySection = sections.find((s) => s.id === selectedSectionId) || sections[0];

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-[var(--whale-cream-soft)]">
      <TextFormatBar />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-3 py-4 lg:px-4 lg:py-5">
          {displaySection ? (
            <SectionWrapper
              section={displaySection}
              onUpdate={(content) => onUpdateSection(displaySection.id, content)}
              onRemove={() => onRemoveSection(displaySection.id)}
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[var(--whale-divider)] text-sm text-[var(--whale-ink-muted)]">
              请选择或添加一个模块
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
