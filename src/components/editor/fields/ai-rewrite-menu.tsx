'use client';

import { useTranslations } from 'next-intl';
import { BarChart3, Sparkles, Target, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';

import { buildRewriteInstruction, type AiRewriteContext, type AiRewriteMode } from '@/lib/ai-rewrite';
export type { AiRewriteContext } from '@/lib/ai-rewrite';

const MODES: { mode: AiRewriteMode; icon: typeof Sparkles }[] = [
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

  const run = (mode: AiRewriteMode) => {
    setPendingAiMessage({ text: buildRewriteInstruction(mode, text.trim(), context, language), resumeId });
    setRightPaneTab('ai');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={t('menu')}
          title={t('menu')}
          className="shrink-0 cursor-pointer text-[var(--whale-mint-deep)] hover:bg-[var(--whale-mint)]/30"
        >
          <Sparkles className="h-3.5 w-3.5" />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
