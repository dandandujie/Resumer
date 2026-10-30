'use client';

import { useMemo } from 'react';
import { Check, Undo2, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useProposalsStore } from '@/stores/proposals-store';
import { diffSectionFields } from '@/lib/section-diff';
import { useProposalActions } from '@/components/ai/ai-proposal-card';

interface PreviewProposalOverlayProps {
  sectionId: string;
}

/** Shown above each preview section that has pending AI changes.
 *  Lists field-level changes (no JSON, no metadata) and lets the user
 *  accept or reject the proposal that touched this section. */
export function PreviewProposalOverlay({ sectionId }: PreviewProposalOverlayProps) {
  const t = useTranslations('ai');
  const proposal = useProposalsStore((s) => {
    // Find the newest proposal whose sections include this id with a change
    const candidates = s.proposals.filter((p) =>
      p.beforeSections.some((sec) => sec.id === sectionId) ||
      p.afterSections.some((sec) => sec.id === sectionId)
    );
    return candidates[candidates.length - 1];
  });

  const { handleAccept, handleReject } = useProposalActions(proposal);

  const changes = useMemo(() => {
    if (!proposal) return null;
    const before = proposal.beforeSections.find((s) => s.id === sectionId);
    const after = proposal.afterSections.find((s) => s.id === sectionId);
    if (!before && after) {
      return { kind: 'added' as const, label: '新增模块', fields: [] };
    }
    if (before && !after) {
      return { kind: 'removed' as const, label: '删除模块', fields: [] };
    }
    if (before && after) {
      const fields = diffSectionFields(before, after);
      if (fields.length === 0) return null;
      return { kind: 'modified' as const, label: '修改', fields };
    }
    return null;
  }, [proposal, sectionId]);

  if (!proposal || !changes) return null;

  const accent =
    changes.kind === 'added'
      ? 'border-[var(--app-accent-soft)]/60 bg-[var(--app-accent-soft)]/15'
      : changes.kind === 'removed'
        ? 'border-red-200 bg-red-50/60'
        : 'border-amber-300 bg-amber-50/60';

  return (
    <div
      className={`mb-2 mt-1 overflow-hidden rounded-lg border ${accent} px-2.5 py-2 text-[11px]`}
      data-pending-proposal
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--app-text)]">
          <Wand2 className="h-2.5 w-2.5 text-[var(--app-bg)]" />
        </span>
        <span className="font-semibold text-[var(--app-text)]">{`AI · ${changes.label}`}</span>
        {changes.fields.length > 0 && (
          <span className="text-[var(--app-text-muted)]">
            {t('proposalChangeCount', { count: changes.fields.length })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleReject();
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)]"
          >
            <Undo2 className="h-2.5 w-2.5" />
            {t('proposalReject')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAccept();
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--app-text)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-bg)] transition-transform hover:scale-[1.03]"
          >
            <Check className="h-2.5 w-2.5" />
            {t('proposalAccept')}
          </button>
        </div>
      </div>

      {changes.fields.length > 0 && (
        <ul className="mt-1.5 space-y-1 border-t border-[var(--app-border)]/60 pt-1.5">
          {changes.fields.map((c, i) => (
            <li key={i} className="leading-snug">
              <span className="text-[var(--app-text-muted)]">{c.label}</span>
              <span className="ml-1.5">
                {c.before && (
                  <span className="rounded px-1 text-red-700 line-through decoration-red-400/70">
                    {truncate(c.before, 60)}
                  </span>
                )}
                {c.before && c.after && (
                  <span className="mx-1 text-[var(--app-text-muted)]">→</span>
                )}
                {c.after && (
                  <span className="rounded bg-[var(--app-accent-soft)]/40 px-1 text-[var(--app-text)]">
                    {truncate(c.after, 80)}
                  </span>
                )}
                {!c.before && !c.after && (
                  <span className="text-[var(--app-text-muted)]">—</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
