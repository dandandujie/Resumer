import { useLocale } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import type { ResumeWorkspaceMetadata } from '@/lib/resume-workspace-api';

/** Remains visible in both dashboard views; never relies on a hover menu. */
export function ResumeWorkspaceLink({ resumeId, metadata, targetCount = 0 }: { resumeId: string; metadata?: ResumeWorkspaceMetadata; targetCount?: number }) {
  const zh = useLocale() === 'zh';
  const router = useRouter();
  const derived = !!metadata?.sourceResumeId;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-background px-4 py-2">
    <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={metadata?.context?.goal}>
      {derived ? `${zh ? '定向稿 · 来源：' : 'Target · Source: '}${metadata?.sourceTitle || metadata?.baseTitle} · ${metadata?.context?.goal || ''}${metadata?.baseMissing ? zh ? '（基础已删除）' : ' (base deleted)' : ''}` : zh ? `基础简历 · ${targetCount} 份定向稿` : `Base resume · ${targetCount} targeted versions`}
    </p>
    <Button variant="ghost" size="sm" onClick={() => router.push(`/resume-workspace/${metadata?.baseMissing ? resumeId : metadata?.baseResumeId || resumeId}`)}>{derived ? zh ? '查看改稿空间' : 'Workspace' : zh ? '定向改稿' : 'Tailor'}<ArrowUpRight /></Button>
  </div>;
}
