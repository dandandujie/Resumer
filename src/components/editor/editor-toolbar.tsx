'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
import { AutoSaveToggle } from './auto-save-toggle';
import { useUnsavedStore } from '@/stores/unsaved-store';
import { useSettingsStore } from '@/stores/settings-store';
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

  const withSavedDraft = async (action?: () => void | Promise<void>) => {
    try {
      if (!useSettingsStore.getState().autoSave && useResumeStore.getState().isDirty) { useUnsavedStore.getState().ask(async () => { await action?.(); }, 'required', 'resume'); return; }
      await flushPendingSave(); await action?.();
    }
    catch { toast.error(t('saveFailed'), { position: 'bottom-right' }); }
  };
  const handleBack = () => router.push('/dashboard');
  const saveDraft = async () => { try { await flushPendingSave(); toast.success(t('savedLocally'), { position: 'bottom-right' }); } catch { toast.error(t('saveFailed'), { position: 'bottom-right' }); } };

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
    await withSavedDraft(async () => {
      const newId = await api.duplicateResume(currentResume.id);
      router.push(`/editor/${newId}`);
    });
  };

  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex min-h-14 min-w-0 shrink-0 flex-col items-stretch gap-1.5 border-b py-2',
        'border-[var(--app-border)] bg-[var(--app-sidebar)] pl-20 pr-2 sm:pr-3',
      )}
    >
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleBack()}
          className={cn(
            'h-8 w-8 shrink-0 cursor-pointer text-[var(--app-text-secondary)]',
            'hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]',
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
              'min-w-0 max-w-[8rem] rounded border border-[var(--app-text)]/30',
              'bg-[var(--app-surface)] px-1.5 py-0.5 text-sm font-semibold',
              'text-[var(--app-text)] outline-none focus:border-[var(--app-text)]/50 sm:max-w-48',
            )}
          />
        ) : (
          <button
            type="button"
            onClick={startRename}
            title={t('rename')}
            className="group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--app-hover)]"
          >
            <span className="min-w-0 max-w-[8rem] truncate text-sm font-semibold text-[var(--app-text)] sm:max-w-48">
              {currentResume?.title || ''}
            </span>
            <PenLine
              className="h-3 w-3 shrink-0 text-[var(--app-text-muted)] opacity-0 transition-opacity
              group-hover:opacity-100"
            />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2"><span className="text-xs text-[var(--app-text-muted)]">
          {isSaving ? t('saving') : isDirty ? t('unsaved') : t('savedLocally')}
        </span></div>
      </div>

      <div data-editor-actions className="flex min-w-0 shrink-0 flex-wrap items-center justify-start gap-0.5 sm:gap-1">
        <div data-document-actions className="mr-1 flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-control)] p-0.5">
          <AutoSaveToggle />
          <span className="mx-1 h-4 w-px bg-[var(--app-border)]" aria-hidden />
          <ToolbarSecondary onClick={() => void saveDraft()} title={t('save')} primary={isDirty} icon={Save} label={t('save')} disabled={!currentResume || isSaving} />
          <ToolbarSecondary onClick={() => void withSavedDraft(() => openModal('import'))} title={t('import')} icon={Upload} label={t('import')} disabled={isSaving} />
          <ToolbarSecondary onClick={() => void withSavedDraft(() => openModal('export'))} title={t('exportPdf')} icon={Download} label={t('exportPdf')} disabled={isSaving} />
          <ToolbarSecondary onClick={() => openModal('version-history')} title={t('history')} icon={History} label={t('history')} />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className={cn(
            'h-8 w-auto cursor-pointer px-2 text-[var(--app-text-secondary)]',
            'hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-40',
          )}
          title={t('undo')}
        >
          <Undo2 className="h-4 w-4" /><span className="text-xs">{t('undo')}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className={cn(
            'h-8 w-auto cursor-pointer px-2 text-[var(--app-text-secondary)]',
            'hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-40',
          )}
          title={t('redo')}
        >
          <Redo2 className="h-4 w-4" /><span className="text-xs">{t('redo')}</span>
        </Button>

        <span className="mx-1 hidden h-5 w-px bg-[var(--app-border)] md:inline-block" />

        <div className="hidden md:block"><ToolbarSecondary onClick={() => void withSavedDraft(() => openModal('jd-analysis'))} title={t('jdAnalysis')} icon={FileSearch} label={t('jdAnalysis')} /></div>
        <div className="hidden lg:block"><ToolbarSecondary onClick={() => void withSavedDraft(() => openModal('journal'))} title={t('journal')} icon={BookOpenCheck} label={t('journal')} /></div>
        <div className="hidden xl:block"><ToolbarSecondary onClick={() => void withSavedDraft(() => openModal('interview'))} title={t('interview')} icon={MessagesSquare} label={t('interview')} /></div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 cursor-pointer gap-1 px-2 text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]" title={t('aiTools')}>
              <Sparkles className="h-4 w-4" /><span className="text-xs">{t('aiTools')}</span><ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={() => void withSavedDraft(() => openModal('grammar-check'))}><SpellCheck className="mr-2 h-4 w-4" />{t('grammarCheck')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => void withSavedDraft(() => openModal('translate'))}><Languages className="mr-2 h-4 w-4" />{t('translate')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => void withSavedDraft(() => openModal('cover-letter'))}><PenLine className="mr-2 h-4 w-4" />{t('coverLetter')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button data-toolbar-more variant="ghost" size="sm" className="h-8 gap-1 px-2"><MoreHorizontal className="h-4 w-4" /><span className="text-xs">{t('more')}</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer md:hidden" onClick={() => void withSavedDraft(() => openModal('jd-analysis'))}><FileSearch className="mr-2 h-4 w-4" />{t('jdAnalysis')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer lg:hidden" onClick={() => void withSavedDraft(() => openModal('journal'))}><BookOpenCheck className="mr-2 h-4 w-4" />{t('journal')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer xl:hidden" onClick={() => void withSavedDraft(() => openModal('interview'))}><MessagesSquare className="mr-2 h-4 w-4" />{t('interview')}</DropdownMenuItem>
            <DropdownMenuSeparator className="xl:hidden" />
<DropdownMenuItem onClick={() => void handleDuplicate()}><Copy className="mr-2 h-4 w-4" />{t('duplicate')}</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => openModal('settings')}
          className={cn(
            'h-8 w-auto cursor-pointer px-2 text-[var(--app-text-secondary)]',
            'hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]',
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
  disabled,
  primary = false,
}: {
  primary?: boolean;
  onClick: () => void;
  title: string;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={primary ? "primary" : "ghost"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 cursor-pointer gap-1 px-2',
        !primary && 'text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]',
      )}
      title={title}
    >
      <Icon className="h-4 w-4" />
      <span className="ml-1 text-xs">{label}</span>
    </Button>
  );
}
