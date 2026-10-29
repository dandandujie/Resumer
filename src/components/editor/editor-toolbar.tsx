'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Download,
  Upload,
  Settings,
  Save,
  Languages,
  SpellCheck,
  BookOpenCheck,
  MoreHorizontal,
  PenLine,
  MessagesSquare,
  FileSearch,
  Sparkles,
  ChevronDown,
  Copy,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useEditorStore } from '@/stores/editor-store';
import * as api from '@/lib/tauri-api';
import { useResumeStore } from '@/stores/resume-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

export function EditorToolbar() {
  const t = useTranslations('editor.toolbar');
  const router = useRouter();
  const {
    undo,
    redo,
    undoStack,
    redoStack,
  } = useEditorStore();
  const {
    isSaving,
    isDirty,
    currentResume,
    reorderSections,
    updateThemeConfig,
    flushPendingSave,
    setTitle,
  } = useResumeStore();
  const { openModal } = useUIStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const startRename = () => {
    setTitleDraft(currentResume?.title || '');
    setEditingTitle(true);
  };
  const commitTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== currentResume?.title) setTitle(v);
    setEditingTitle(false);
  };

  const handleBack = async () => {
    await flushPendingSave();
    router.push('/dashboard');
  };

  const handleUndo = () => {
    const snapshot = undo(useResumeStore.getState().sections);
    if (snapshot) {
      reorderSections(snapshot.sections);
      if (snapshot.themeConfig) updateThemeConfig(snapshot.themeConfig);
    }
  };

  const handleRedo = () => {
    const snapshot = redo(useResumeStore.getState().sections);
    if (snapshot) {
      reorderSections(snapshot.sections);
      if (snapshot.themeConfig) updateThemeConfig(snapshot.themeConfig);
    }
  };

  const handleDuplicate = async () => {
    if (!currentResume) return;
    await flushPendingSave();
    const newId = await api.duplicateResume(currentResume.id);
    router.push(`/editor/${newId}`);
  };

  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex min-h-14 min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b py-2',
        'border-[var(--whale-divider)] bg-[var(--whale-sidebar)] pl-20 pr-2 sm:pr-3',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 max-lg:basis-full sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleBack()}
          className={cn(
            'h-8 w-8 shrink-0 cursor-pointer text-[var(--whale-ink-soft)]',
            'hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]',
          )}
          disabled={isSaving}
          title={t('back')}
          aria-label={t('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              else if (e.key === 'Escape') setEditingTitle(false);
            }}
            className={cn(
              'min-w-0 max-w-[8rem] rounded border border-[var(--whale-ink)]/30',
              'bg-[var(--whale-card)] px-1.5 py-0.5 text-sm font-semibold',
              'text-[var(--whale-ink)] outline-none focus:border-[var(--whale-ink)]/50 sm:max-w-48',
            )}
          />
        ) : (
          <button
            type="button"
            onClick={startRename}
            title={t('rename')}
            className="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--whale-cream-deep)]"
          >
            <span className="min-w-0 max-w-[8rem] truncate text-sm font-semibold text-[var(--whale-ink)] sm:max-w-48">
              {currentResume?.title || ''}
            </span>
            <PenLine
              className="h-3 w-3 shrink-0 text-[var(--whale-ink-muted)] opacity-0 transition-opacity
              group-hover:opacity-100"
            />
          </button>
        )}
        <span className="hidden text-xs text-[var(--whale-ink-muted)] sm:inline">
          {isSaving ? t('saving') : isDirty ? t('unsaved') : ''}
        </span>
      </div>

      <div data-editor-actions className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-0.5 max-lg:w-full sm:gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 cursor-pointer gap-1 text-[var(--whale-ink-soft)]',
                'hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]',
              )}
              title={t('file')}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="text-xs">{t('file')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={!currentResume || !isDirty || isSaving}
              onClick={() => void flushPendingSave()}
            >
              <Save className="mr-2 h-4 w-4" />
              {t('save')}{' '}
              <span className="ml-auto pl-4 text-xs text-muted-foreground">
                ⌘S
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => openModal('import')}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('import')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => openModal('export')}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('exportPdf')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => void handleDuplicate()}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('duplicate')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => openModal('version-history')}
            >
              <History className="mr-2 h-4 w-4" />
              {t('history')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className={cn(
            'h-8 w-8 cursor-pointer text-[var(--whale-ink-soft)] sm:w-auto sm:px-2',
            'hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] disabled:opacity-40',
          )}
          title={t('undo')}
        >
          <Undo2 className="h-4 w-4" /><span className="hidden text-xs sm:inline">{t('undo')}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className={cn(
            'h-8 w-8 cursor-pointer text-[var(--whale-ink-soft)] sm:w-auto sm:px-2',
            'hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)] disabled:opacity-40',
          )}
          title={t('redo')}
        >
          <Redo2 className="h-4 w-4" /><span className="hidden text-xs sm:inline">{t('redo')}</span>
        </Button>

        <span className="mx-1 hidden h-5 w-px bg-[var(--whale-divider)] md:inline-block" />

        <ToolbarSecondary onClick={() => openModal('export')} title={t('exportPdf')} icon={Download} label={t('exportPdf')} />
        <div className="hidden md:block"><ToolbarSecondary onClick={() => openModal('jd-analysis')} title={t('jdAnalysis')} icon={FileSearch} label={t('jdAnalysis')} /></div>
        <div className="hidden lg:block"><ToolbarSecondary onClick={() => openModal('journal')} title={t('journal')} icon={BookOpenCheck} label={t('journal')} /></div>
        <div className="hidden xl:block"><ToolbarSecondary onClick={() => openModal('interview')} title={t('interview')} icon={MessagesSquare} label={t('interview')} /></div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 cursor-pointer gap-1 px-2 text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)]" title={t('aiTools')}>
              <Sparkles className="h-4 w-4" /><span className="text-xs">{t('aiTools')}</span><ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer md:hidden" onClick={() => openModal('jd-analysis')}><FileSearch className="mr-2 h-4 w-4" />{t('jdAnalysis')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer lg:hidden" onClick={() => openModal('journal')}><BookOpenCheck className="mr-2 h-4 w-4" />{t('journal')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer xl:hidden" onClick={() => openModal('interview')}><MessagesSquare className="mr-2 h-4 w-4" />{t('interview')}</DropdownMenuItem>
            <DropdownMenuSeparator className="xl:hidden" />
            <DropdownMenuItem className="cursor-pointer" onClick={() => openModal('grammar-check')}><SpellCheck className="mr-2 h-4 w-4" />{t('grammarCheck')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => openModal('translate')}><Languages className="mr-2 h-4 w-4" />{t('translate')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => openModal('cover-letter')}><PenLine className="mr-2 h-4 w-4" />{t('coverLetter')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => openModal('settings')}
          className={cn(
            'h-8 w-auto cursor-pointer px-2 text-[var(--whale-ink-soft)]',
            'hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]',
          )}
          title={t('settings')}
        >
          <Settings className="h-4 w-4" />
          <span className="ml-1 text-xs">{t('settings')}</span>
        </Button>

      </div>
    </div>
  );
}

function ToolbarSecondary({
  onClick,
  title,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  title: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-8 cursor-pointer gap-1 px-2 text-[var(--whale-ink-soft)]',
        'hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]',
      )}
      title={title}
    >
      <Icon className="h-4 w-4" />
      <span className="ml-1 text-xs">{label}</span>
    </Button>
  );
}
