'use client';

import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { useJournalStore, OPEN_STATUSES } from '@/stores/journal-store';

/** 这份简历投了几家、几家还在进行中——让"简历"卡片长出"求职"这条线。 */
export function ResumeApplicationCount({ resumeId, className }: { resumeId: string; className?: string }) {
  const t = useTranslations('dashboard');
  const total = useJournalStore((s) => s.applications.filter((a) => a.resumeId === resumeId).length);
  const open = useJournalStore(
    (s) => s.applications.filter((a) => a.resumeId === resumeId && OPEN_STATUSES.includes(a.status)).length
  );
  if (total === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[var(--app-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-text-secondary)] ${className ?? ''}`}>
      <Send className="h-2.5 w-2.5" />
      {open > 0 ? t('cardApplicationsOpen', { total, open }) : t('cardApplications', { total })}
    </span>
  );
}
