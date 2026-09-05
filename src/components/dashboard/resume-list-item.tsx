'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Trash2, MoreVertical, Pencil } from 'lucide-react';
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
      className={`group flex items-center gap-4 rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-3 transition-all duration-200 ${isRenaming ? '' : 'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--whale-ink)]/30 hover:shadow-[0_8px_24px_-12px_rgba(28,26,23,0.18)]'}`}
      onClick={() => { if (!renamingRef.current) router.push(`/editor/${resume.id}`); }}
    >
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
            className="w-full truncate rounded border border-[var(--whale-ink)] bg-[var(--whale-cream)] px-1 text-sm font-semibold text-[var(--whale-ink)] outline-none focus:ring-1 focus:ring-[var(--whale-ink)]"
          />
        ) : (
          <h3 className="truncate text-sm font-semibold text-[var(--whale-ink)]">
            {resume.title}
          </h3>
        )}
      </div>
      <ResumeApplicationCount resumeId={resume.id} className="hidden shrink-0 sm:inline-flex" />
      {/* Last edited */}
      <span className="hidden shrink-0 text-[12px] text-[var(--whale-ink-muted)] sm:inline">
        {resume.updatedAt
          ? t('dashboard.lastEdited', {
              date: new Date(resume.updatedAt).toLocaleDateString(),
            })
          : ''}
      </span>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="cursor-pointer rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--whale-cream-soft)]"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4 text-[var(--whale-ink-muted)]" />
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
