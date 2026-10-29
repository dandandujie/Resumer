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
import { plainText } from '@/lib/resume-text';
import { ResumeApplicationCount } from './resume-application-count';

interface ResumeCardProps {
  resume: Resume;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (title: string) => void;
}

/** Real content preview — name/role, latest experience, skill chips. */
function ResumeContentPreview({ resume }: { resume: Resume }) {
  const t = useTranslations('dashboard');
  const s = resume.summary;
  const hasIdentity = !!(s?.fullName || s?.jobTitle);
  const hasExperience = !!(s?.latestCompany || s?.latestPosition);
  const isEmpty = !hasIdentity && !hasExperience && !(s?.skills?.length);

  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl bg-[var(--whale-card)] ring-1 ring-[var(--whale-divider)]">
      {resume.template === 'original-docx' ? (
        <div className="flex h-full flex-col justify-center px-4">
          <p className="text-sm font-semibold">DOCX</p>
          <p className="mt-1 text-xs text-[var(--whale-ink-muted)]">{t('originalDocument')}</p>
        </div>
      ) : isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
          <p className="text-xs font-medium text-[var(--whale-ink-muted)]">{t('cardEmptyTitle')}</p>
          <p className="text-[11px] text-[var(--whale-ink-muted)]/70">{t('cardEmptyHint')}</p>
        </div>
      ) : (
        <div className="flex h-full flex-col p-3">
          {/* Identity line */}
          <div className="flex min-w-0 items-baseline gap-1.5 pr-8">
            <span className="truncate text-[13px] font-semibold text-[var(--whale-ink)]">
              {plainText(s?.fullName || '') || t('cardNoName')}
            </span>
            {s?.jobTitle && (
              <span className="truncate text-[11px] text-[var(--whale-ink-muted)]">{plainText(s.jobTitle)}</span>
            )}
          </div>
          {/* Latest experience */}
          {hasExperience && (
            <p className="mt-1 truncate text-[11px] text-[var(--whale-ink-soft)]">
              {[s?.latestCompany, s?.latestPosition].filter(Boolean).map(value => plainText(value!)).join(' · ')}
            </p>
          )}
          {/* Skill chips */}
          {!!s?.skills?.length && (
            <div className="mt-auto flex flex-wrap gap-1 overflow-hidden" style={{ maxHeight: 38 }}>
              {s.skills.slice(0, 4).map((skill) => (
                <span
                  key={plainText(skill)}
                  className="inline-block max-w-[7rem] truncate rounded-full bg-[var(--whale-mint)]/30 px-1.5 py-0.5 text-[10px] font-medium text-[var(--whale-ink)]"
                >
                  {plainText(skill)}
                </span>
              ))}
              {s.skills.length > 4 && (
                <span className="inline-block rounded-full bg-[var(--whale-cream-deep)] px-1.5 py-0.5 text-[10px] text-[var(--whale-ink-muted)]">
                  +{s.skills.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {/* Language badge */}
      <span className="absolute right-2 top-2 rounded-full bg-[var(--whale-ink)] px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-[var(--whale-cream)]">
        {(resume.language || 'zh').toUpperCase()}
      </span>
    </div>
  );
}

export function ResumeCard({ resume, onDelete, onDuplicate, onRename }: ResumeCardProps) {
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
      className={`group relative overflow-hidden rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] transition-all duration-200 ${isRenaming ? '' : 'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--whale-ink)]/30 hover:shadow-[0_12px_32px_-12px_rgba(28,26,23,0.18)]'}`}
      onClick={() => { if (!renamingRef.current) router.push(`/editor/${resume.id}`); }}
    >
      <div className="bg-[var(--whale-cream-soft)] p-4">
        <ResumeContentPreview resume={resume} />
      </div>

      {/* Info section */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
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
                className="w-full truncate rounded border border-[var(--whale-ink)] bg-[var(--whale-card)] px-1 text-sm font-semibold text-[var(--whale-ink)] outline-none focus:ring-1 focus:ring-[var(--whale-ink)]"
              />
            ) : (
              <h3 className="truncate text-sm font-semibold text-[var(--whale-ink)]">
                {resume.title}
              </h3>
            )}
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--whale-ink-muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--whale-mint-deep)]" />
              <span className="truncate">
                {resume.updatedAt
                  ? t('dashboard.lastEdited', {
                      date: new Date(resume.updatedAt).toLocaleDateString(),
                    })
                  : ''}
              </span>
              <ResumeApplicationCount resumeId={resume.id} className="ml-auto shrink-0" />
            </div>
          </div>
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
      </div>
    </div>
  );
}
