'use client';

import { useTranslations } from 'next-intl';
import { MessageSquareText, BarChart3, Sparkles, Target, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';

import { useUIStore } from '@/stores/ui-store';
import { practiceTargets } from '@/lib/interview-practice';
import { buildRewriteInstruction, type AiRewriteContext, type AiRewriteMode } from '@/lib/ai-rewrite';
export type { AiRewriteContext } from '@/lib/ai-rewrite';

const MODES: { mode: AiRewriteMode; icon: typeof Sparkles }[] = [
  { mode: 'clear', icon: Sparkles },
  { mode: 'quantify', icon: BarChart3 },
  { mode: 'star', icon: Workflow },
  { mode: 'jd', icon: Target },
];

export function AiRewriteMenu({ text, context }: { text: string; context: AiRewriteContext }) {
  const t = useTranslations('editor.aiRewrite');
  const language = useResumeStore((s) => s.currentResume?.language) || 'zh';
  const resumeId = useResumeStore((s) => s.currentResume?.id);
  const setPendingAiMessage = useEditorStore((s) => s.setPendingAiMessage);
  const setRightPaneTab = useEditorStore((s) => s.setRightPaneTab);
  const disabled = !text.trim();
  const sections = useResumeStore(s => s.sections);
  const practiceTarget = practiceTargets(sections).find(target => target.sectionId === context.sectionId && (!context.itemId || target.itemId === context.itemId) && (!context.fieldPath || target.field === context.fieldPath) && target.text === text);

  const run = (mode: AiRewriteMode) => {
    setPendingAiMessage({ text: buildRewriteInstruction(mode, text.trim(), context, language), resumeId });
    setRightPaneTab('ai');
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={disabled}
          aria-label={t('menu')}
          title={t('menu')}
          className="h-6 shrink-0 gap-1 px-1 text-[10px] text-[var(--app-text-muted)]"
        >
          <Sparkles className="h-3 w-3" />{t('trigger')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">{t('hint')}</DropdownMenuLabel>
        {MODES.map(({ mode, icon: Icon }) => (
          <DropdownMenuItem key={mode} className="cursor-pointer" onClick={() => run(mode)}>
            <Icon className="mr-2 h-3.5 w-3.5" />
            <div>
              <div className="text-xs">{t(`${mode}.label`)}</div>
              <div className="text-[10px] text-muted-foreground">{t(`${mode}.description`)}</div>
            </div>
          </DropdownMenuItem>
        ))}
        {practiceTarget && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => {
          useEditorStore.getState().setToolPrefill({ practiceTarget });
          useUIStore.getState().openModal('interview');
        }}><MessageSquareText className="mr-2 size-3.5" />{t('practice')}</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu></div>
  );
}
