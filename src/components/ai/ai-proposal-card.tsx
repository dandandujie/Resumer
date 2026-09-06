'use client';

import { useMemo, useCallback, useState } from 'react';
import { Check, Undo2, Wand2, Plus, Trash2, RefreshCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { logError } from '@/stores/error-log-store';
import { useProposalsStore, type Proposal } from '@/stores/proposals-store';
import { useResumeStore } from '@/stores/resume-store';
import { diffSectionFields, type FieldChange } from '@/lib/section-diff';
import type { ResumeSection } from '@/types/resume';
import * as api from '@/lib/tauri-api';

const TOOL_META: Record<
  string,
  { icon: typeof Wand2; key: string; defaultLabel: string }
> = {
  updateSection: { icon: Wand2, key: 'proposalSummaryModified', defaultLabel: '修改' },
  rewriteText: { icon: RefreshCcw, key: 'proposalSummaryRewrite', defaultLabel: '改写' },
  suggestSkills: { icon: Wand2, key: 'proposalSummaryModified', defaultLabel: '补充技能' },
  addSection: { icon: Plus, key: 'proposalSummaryAdded', defaultLabel: '新增' },
  removeSection: { icon: Trash2, key: 'proposalSummaryRemoved', defaultLabel: '删除' },
};

export interface ProposalSummary {
  primaryLabel: string;
  affectedSectionTitles: string[];
  totalChanges: number;
}

/** Build a one-line summary describing what the AI did. */
export function summarizeProposal(proposal: Proposal): ProposalSummary {
  const meta = TOOL_META[proposal.toolName] ?? TOOL_META.updateSection;
  const beforeMap = new Map(proposal.beforeSections.map((s) => [s.id, s]));
  const afterMap = new Map(proposal.afterSections.map((s) => [s.id, s]));
  const titles: string[] = [];
  let total = 0;

  for (const a of proposal.afterSections) {
    const b = beforeMap.get(a.id);
    if (!b) {
      titles.push(a.title);
      total += 1;
    } else {
      const changes = diffSectionFields(b, a);
      if (changes.length > 0) {
        titles.push(a.title);
        total += changes.length;
      }
    }
  }
  for (const b of proposal.beforeSections) {
    if (!afterMap.has(b.id)) {
      titles.push(b.title);
      total += 1;
    }
  }

  return {
    primaryLabel: meta.defaultLabel,
    affectedSectionTitles: titles,
    totalChanges: total,
  };
}

/** Compute field changes per affected section (used by both chat card and preview overlay). */
export function getProposalChangesBySection(
  proposal: Proposal,
): Map<string, { section: ResumeSection; changes: FieldChange[]; kind: 'modified' | 'added' | 'removed' }> {
  const map = new Map<string, { section: ResumeSection; changes: FieldChange[]; kind: 'modified' | 'added' | 'removed' }>();
  const beforeMap = new Map(proposal.beforeSections.map((s) => [s.id, s]));
  const afterMap = new Map(proposal.afterSections.map((s) => [s.id, s]));

  for (const a of proposal.afterSections) {
    const b = beforeMap.get(a.id);
    if (!b) {
      map.set(a.id, { section: a, changes: [], kind: 'added' });
    } else {
      const changes = diffSectionFields(b, a);
      if (changes.length > 0) {
        map.set(a.id, { section: a, changes, kind: 'modified' });
      }
    }
  }
  for (const b of proposal.beforeSections) {
    if (!afterMap.has(b.id)) {
      map.set(b.id, { section: b, changes: [], kind: 'removed' });
    }
  }
  return map;
}

/** Shared accept/reject handlers — used by both chat card and preview overlay. */
export function useProposalActions(proposal: Proposal | undefined) {
  const t = useTranslations('ai');

  // 改动在工具执行时已经写库；"采纳"只是确认并收起提案卡。
  const handleAccept = useCallback(() => {
    if (!proposal) return;
    useProposalsStore.getState().acceptProposal(proposal.id);
    toast.success(t('proposalAccepted'));
  }, [proposal, t]);

  const handleReject = useCallback(async () => {
    if (!proposal) return;
    const store = useResumeStore.getState();
    const current = store.currentResume;
    if (!current) {
      useProposalsStore.getState().rejectProposal(proposal.id);
      return;
    }

    // Build a map of section IDs that were touched by this proposal
    const touchedIds = new Set<string>();
    for (const s of proposal.beforeSections) touchedIds.add(s.id);
    for (const s of proposal.afterSections) touchedIds.add(s.id);

    // Merge: keep untouched sections from current state, restore touched sections from beforeSections
    const beforeMap = new Map(proposal.beforeSections.map((s) => [s.id, s]));

    const restoredSections = current.sections
      .map((currentSection) => {
        if (!touchedIds.has(currentSection.id)) {
          // This section wasn't touched by the AI — keep current state
          return currentSection;
        }
        // This section was touched — restore from beforeSections if it existed
        const before = beforeMap.get(currentSection.id);
        if (before) {
          return before;
        }
        // Section was added by AI and doesn't exist in before — remove it
        return null;
      })
      .filter((s): s is ResumeSection => s !== null);

    // Re-add any sections that were removed by AI (existed in before but not in current)
    for (const before of proposal.beforeSections) {
      if (!current.sections.some((s) => s.id === before.id)) {
        restoredSections.push(before);
      }
    }

    // Sort by original sort order
    restoredSections.sort((a, b) => a.sortOrder - b.sortOrder);

    store.setResume({
      ...current,
      sections: restoredSections,
    } as any);

    try {
      await api.updateResume(proposal.resumeId, {
        title: current.title,
        template: current.template,
        themeConfig: current.themeConfig,
        sections: restoredSections,
      });
    } catch (err) {
      console.error('Failed to persist rejection:', err);
      logError(t('proposalRejectFailed'));
      return;
    }

    const all = useProposalsStore.getState().proposals;
    const stale = all.filter((p) => p.createdAt >= proposal.createdAt).map((p) => p.id);
    stale.forEach((id) => useProposalsStore.getState().rejectProposal(id));

    const droppedCount = stale.length - 1;
    if (droppedCount > 0) {
      toast.success(t('proposalRejectedCascade', { count: droppedCount }));
    } else {
      toast.success(t('proposalRejected'));
    }
  }, [proposal, t]);

  return { handleAccept, handleReject };
}

interface AIProposalCardProps {
  toolCallId: string;
}

/** Slim chat card — just a one-line summary + accept/reject buttons.
 *  The detailed diff visualization lives in the preview overlay. */
export function KnowledgeProposalCard({
  path,
  content,
  reason,
}: {
  path: string;
  content: string;
  reason: string;
}) {
  const [accepted, setAccepted] = useState(false);
  const t = useTranslations('ai');
  const [saving, setSaving] = useState(false);
  const accept = async () => {
    setSaving(true);
    try {
      await api.knowledgeWrite(path, content);
      setAccepted(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="my-2 rounded-xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-3 py-2">
      <div className="text-[12px] font-semibold text-[var(--whale-ink)]">{t('knowledgeProposal')}</div>
      <div className="mt-1 truncate text-[11px] text-[var(--whale-ink-muted)]">{path}</div>
      <div className="mt-1 text-[11px] text-[var(--whale-ink-soft)]">{t('knowledgeProposalReason', { reason })}</div>
      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] text-[var(--whale-ink-muted)]">{content}</div>
      <div className="mt-2 flex justify-end gap-1">
        {accepted ? (
          <span className="text-[11px] text-[var(--whale-mint-deep)]">{t('knowledgeProposalAccepted')}</span>
        ) : (
          <>
            <button type="button" className="rounded-md border px-2 py-1 text-[11px]" onClick={() => setAccepted(true)}>
              <Undo2 className="mr-1 inline h-3 w-3" />{t('proposalReject')}
            </button>
            <button type="button" className="rounded-md bg-[var(--whale-ink)] px-2 py-1 text-[11px] text-white" onClick={() => void accept()} disabled={saving}>
              <Check className="mr-1 inline h-3 w-3" />{t('proposalAccept')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AIProposalCard({ toolCallId }: AIProposalCardProps) {
  const proposal = useProposalsStore((s) =>
    s.proposals.find((p) => p.toolCallId === toolCallId)
  );
  const { handleAccept, handleReject } = useProposalActions(proposal);
  const t = useTranslations('ai');

  const summary = useMemo(
    () => (proposal ? summarizeProposal(proposal) : null),
    [proposal]
  );

  if (!proposal || !summary) return null;

  const meta = TOOL_META[proposal.toolName] ?? TOOL_META.updateSection;
  const Icon = meta.icon;
  const sectionLabel =
    summary.affectedSectionTitles.length > 0
      ? summary.affectedSectionTitles.slice(0, 2).join('、') +
        (summary.affectedSectionTitles.length > 2 ? '…' : '')
      : '';

  return (
    <div className="my-2 flex items-center gap-2 rounded-xl border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--whale-ink)]">
        <Icon className="h-3 w-3 text-[var(--whale-cream)]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-[var(--whale-ink)]">
          {t(meta.key, { section: sectionLabel })}
        </div>
        {summary.totalChanges > 0 && (
          <div className="text-[11px] text-[var(--whale-ink-muted)]">
            {t('proposalChangeCount', { count: summary.totalChanges })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleReject}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--whale-divider)] bg-[var(--whale-card)] px-2 py-1 text-[11px] font-medium text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-deep)]"
        >
          <Undo2 className="h-3 w-3" />
          {t('proposalReject')}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--whale-ink)] px-2 py-1 text-[11px] font-medium text-[var(--whale-cream)] transition-transform hover:scale-[1.03]"
        >
          <Check className="h-3 w-3" />
          {t('proposalAccept')}
        </button>
      </div>
    </div>
  );
}
