'use client';

import { Pencil, Sparkles, Palette } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FormatRibbon } from './format-ribbon';
import { EditorCanvas } from './editor-canvas';
import { AIChatContent } from '@/components/ai/ai-chat-panel';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection, SectionContent } from '@/types/resume';

interface EditorRightPaneProps {
  resumeId: string;
  sections: ResumeSection[];
  onUpdateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  onRemoveSection: (sectionId: string) => void;
}

export function EditorRightPane({
  resumeId,
  sections,
  onUpdateSection,
  onRemoveSection,
}: EditorRightPaneProps) {
  const t = useTranslations('editor');
  const tAi = useTranslations('ai');
  const showThemeEditor = useEditorStore((s) => s.showThemeEditor);
  const rightPaneTab = useEditorStore((s) => s.rightPaneTab);
  const setRightPaneTab = useEditorStore((s) => s.setRightPaneTab);

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-[var(--whale-divider)] bg-[var(--whale-card)]">
      <Tabs
        value={showThemeEditor ? 'style' : rightPaneTab}
        onValueChange={(v) => {
          useEditorStore.setState({ showThemeEditor: v === 'style' });
          if (v !== 'style') setRightPaneTab(v as 'edit' | 'ai');
        }}
        className="flex h-full min-h-0 flex-col"
      >
        <div className="shrink-0 border-b border-[var(--whale-divider)] bg-[var(--whale-sidebar)] px-3 py-2">
          <TabsList className="h-9 w-full bg-[var(--whale-cream-soft)] p-0.5">
            <TabsTrigger
              value="edit"
              className="flex-1 cursor-pointer gap-1.5 rounded-md text-[13px] data-[state=active]:bg-[var(--whale-card)] data-[state=active]:text-[var(--whale-ink)] data-[state=active]:shadow-sm"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('edit')}
            </TabsTrigger>
            <TabsTrigger value="style" className="flex-1 cursor-pointer gap-1.5 rounded-md text-[13px] data-[state=active]:bg-[var(--whale-card)] data-[state=active]:shadow-sm">
              <Palette className="h-3.5 w-3.5" />{t('toolbar.theme')}
            </TabsTrigger>
            <TabsTrigger
              value="ai"
              className="flex-1 cursor-pointer gap-1.5 rounded-md text-[13px] data-[state=active]:bg-[var(--whale-card)] data-[state=active]:text-[var(--whale-ink)] data-[state=active]:shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--whale-ink)]" />
              {tAi('panelTitle')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="flex-1 min-h-0 overflow-hidden">
          <EditorCanvas
            sections={sections}
            onUpdateSection={onUpdateSection}
            onRemoveSection={onRemoveSection}
          />
        </TabsContent>

        <TabsContent value="style" className="min-h-0 flex-1 overflow-hidden"><FormatRibbon /></TabsContent>

        <TabsContent value="ai" className="flex-1 min-h-0 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col bg-[var(--whale-card)]">
            <AIChatContent resumeId={resumeId} hideTitle />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
