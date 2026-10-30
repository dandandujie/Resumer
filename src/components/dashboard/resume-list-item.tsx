'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Trash2, MoreVertical, Pencil, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Resume } from '@/types/resume';
import { ResumeApplicationCount } from './resume-application-count';

interface ResumeListItemProps {
  resume: Resume;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (title: string) => void;
}

export function ResumeListItem({ resume, onDelete, onDuplicate, onRename }: ResumeListItemProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(resume.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const renamingRef = useRef(false);

  const startRenaming = () => {
    renamingRef.current = true;
    setIsRenaming(true);
  };

  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== resume.title) {
      onRename(trimmed);
    } else {
      setRenameValue(resume.title);
    }
    setIsRenaming(false);
    renamingRef.current = false;
  }, [renameValue, resume.title, onRename]);

  // Commit rename on any click outside the input (fires before blur)
  useEffect(() => {
    if (!isRenaming) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        commitRename();
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [isRenaming, commitRename]);

  // On blur, refocus if still renaming (handles Radix focus stealing)
  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (renamingRef.current && inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, []);
  return (
    <div
      className={`group flex items-center gap-3 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3 last:border-b-0 transition-colors duration-150 ${isRenaming ? '' : 'cursor-pointer hover:bg-[var(--app-surface-muted)]'}`}
      onClick={() => { if (!renamingRef.current) router.push(`/editor/${resume.id}`); }}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-surface)]"><FileText className="size-[18px] text-[var(--app-accent)]" /></div>
      {/* Title */}
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { setRenameValue(resume.title); setIsRenaming(false); renamingRef.current = false; }
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full truncate rounded border border-[var(--app-text)] bg-[var(--app-bg)] px-1 text-[13px] font-medium text-[var(--app-text)] outline-none focus:ring-1 focus:ring-[var(--app-text)]"
          />
        ) : (
          <h3 className="truncate text-[13px] font-medium text-[var(--app-text)]">
            {resume.title}
          </h3>
        )}
        <p className="mt-1 truncate text-[11px] text-[var(--app-text-muted)]">{[resume.summary?.jobTitle, resume.summary?.latestCompany].filter(Boolean).join(' · ') || (resume.template === 'original-docx' ? 'DOCX' : t('dashboard.cardEmptyHint'))}</p>
      </div>
      <ResumeApplicationCount resumeId={resume.id} className="hidden shrink-0 sm:inline-flex" />
      {/* Last edited */}
      <span className="hidden shrink-0 text-[12px] text-[var(--app-text-muted)] sm:inline">
        {resume.updatedAt
          ? t('dashboard.lastEdited', {
              date: new Date(resume.updatedAt).toLocaleDateString(),
            })
          : ''}
      </span>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="cursor-pointer rounded-md p-1.5 text-[var(--app-text-muted)] hover:bg-[var(--app-hover)]"
          aria-label={t('editor.toolbar.more')}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4 text-[var(--app-text-muted)]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => { if (renamingRef.current) e.preventDefault(); }}>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              startRenaming();
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {t('common.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('common.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
