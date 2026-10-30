"use client";

import { useMemo, useCallback, useState } from "react";
import { Check, Undo2, Wand2, Plus, Trash2, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { logError } from "@/stores/error-log-store";
import { useProposalsStore, type Proposal } from "@/stores/proposals-store";
import { useResumeStore } from "@/stores/resume-store";
import { diffSectionFields, type FieldChange } from "@/lib/section-diff";
import type { ResumeSection } from "@/types/resume";
import * as api from "@/lib/tauri-api";
import { useEditorStore } from "@/stores/editor-store";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}

const TOOL_META: Record<
  string,
  { icon: typeof Wand2; key: string; defaultLabel: string }
> = {
  updateSection: {
    icon: Wand2,
    key: "proposalSummaryModified",
    defaultLabel: "修改",
  },
  rewriteText: {
    icon: RefreshCcw,
    key: "proposalSummaryRewrite",
    defaultLabel: "改写",
  },
  suggestSkills: {
    icon: Wand2,
    key: "proposalSummaryModified",
    defaultLabel: "补充技能",
  },
  addSection: { icon: Plus, key: "proposalSummaryAdded", defaultLabel: "新增" },
  removeSection: {
    icon: Trash2,
    key: "proposalSummaryRemoved",
    defaultLabel: "删除",
  },
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
): Map<
  string,
  {
    section: ResumeSection;
    changes: FieldChange[];
    kind: "modified" | "added" | "removed";
  }
> {
  const map = new Map<
    string,
    {
      section: ResumeSection;
      changes: FieldChange[];
      kind: "modified" | "added" | "removed";
    }
  >();
  const beforeMap = new Map(proposal.beforeSections.map((s) => [s.id, s]));
  const afterMap = new Map(proposal.afterSections.map((s) => [s.id, s]));

  for (const a of proposal.afterSections) {
    const b = beforeMap.get(a.id);
    if (!b) {
      map.set(a.id, { section: a, changes: [], kind: "added" });
    } else {
      const changes = diffSectionFields(b, a);
      if (changes.length > 0) {
        map.set(a.id, { section: a, changes, kind: "modified" });
      }
    }
  }
  for (const b of proposal.beforeSections) {
    if (!afterMap.has(b.id)) {
      map.set(b.id, { section: b, changes: [], kind: "removed" });
    }
  }
  return map;
}

/** Shared accept/reject handlers — used by both chat card and preview overlay. */
export function useProposalActions(proposal: Proposal | undefined) {
  const t = useTranslations("ai");

  const handleAccept = useCallback(() => {
    if (!proposal) return;
    const store = useResumeStore.getState();
    if (store.currentResume?.id !== proposal.resumeId) return;
    const before = new Map(
      proposal.beforeSections.map((section) => [section.id, section]),
    );
    const after = new Map(
      proposal.afterSections.map((section) => [section.id, section]),
    );
    const value = (section?: ResumeSection) =>
      section
        ? JSON.stringify([
            section.type,
            section.title,
            section.visible,
            canonical(section.content),
          ])
        : "";
    const changed = new Set(
      [...before.keys(), ...after.keys()].filter(
        (id) => value(before.get(id)) !== value(after.get(id)),
      ),
    );
    if (
      [...changed].some(
        (id) =>
          value(store.sections.find((section) => section.id === id)) !==
          value(before.get(id)),
      )
    ) {
      toast.error(t("proposalDraftConflict"), { position: "bottom-right" });
      return;
    }
    const sections = store.sections
      .map((section) =>
        changed.has(section.id) ? after.get(section.id) : section,
      )
      .filter((section): section is ResumeSection => !!section);
    for (const section of proposal.afterSections)
      if (changed.has(section.id) && !before.has(section.id))
        sections.push(section);
    useEditorStore.getState().pushSnapshot(store.sections);
    store.reorderSections(sections);
    useProposalsStore.getState().acceptProposal(proposal.id);
    toast.success(t("proposalAppliedDraft"), { position: "bottom-right" });
  }, [proposal, t]);

  const handleReject = useCallback(async () => {
    if (!proposal) return;
    const stale = useProposalsStore
      .getState()
      .proposals.filter((p) => p.createdAt >= proposal.createdAt);
    stale.forEach((p) => useProposalsStore.getState().rejectProposal(p.id));
    toast.success(t("proposalRejected"), { position: "bottom-right" });
  }, [proposal, t]);

  return { handleAccept, handleReject };
}

interface AIProposalCardProps {
  toolCallId: string;
}

/** 知识库提案卡：采纳 = 写盘；撤销 = 丢弃。状态由父级（store）持有时通过 onResolved 通知移除，
 *  卡片自身只保留"刚刚发生了什么"的一次性反馈。 */
export function KnowledgeProposalCard({
  path,
  content,
  reason,
  onResolved,
}: {
  path: string;
  content: string;
  reason: string;
  onResolved?: (status: "accepted" | "rejected") => void;
}) {
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">(
    "pending",
  );
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("ai");
  const accept = async () => {
    setSaving(true);
    try {
      await api.knowledgeWrite(path, content);
      setStatus("accepted");
      toast.success(t("knowledgeProposalAccepted"));
      onResolved?.("accepted");
    } catch (error) {
      const message = String((error as Error)?.message || error);
      logError(t("knowledgeProposalFailed"), message);
    } finally {
      setSaving(false);
    }
  };
  const reject = () => {
    setStatus("rejected");
    onResolved?.("rejected");
  };
  return (
    <div className="my-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2">
      <div className="text-[12px] font-semibold text-[var(--app-text)]">
        {t("knowledgeProposal")}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--app-text-muted)]">
        {path}
      </div>
      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
        {t("knowledgeProposalReason", { reason })}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`mt-2 w-full cursor-pointer whitespace-pre-wrap text-left text-[11px] text-[var(--app-text-muted)] ${
          expanded ? "max-h-80 overflow-y-auto" : "line-clamp-3"
        }`}
        aria-expanded={expanded}
      >
        {content}
      </button>
      <div className="mt-2 flex justify-end gap-1">
        {status === "accepted" && (
          <span className="text-[11px] text-[var(--app-accent)]">
            {t("knowledgeProposalAccepted")}
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[11px] text-[var(--app-text-muted)]">
            {t("proposalRejected")}
          </span>
        )}
        {status === "pending" && (
          <>
            <button
              type="button"
              className="cursor-pointer rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px]"
              onClick={reject}
              disabled={saving}
            >
              <Undo2 className="mr-1 inline h-3 w-3" />
              {t("proposalReject")}
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md bg-[var(--app-text)] px-2 py-1 text-[11px] text-[var(--app-bg)] disabled:opacity-50"
              onClick={() => void accept()}
              disabled={saving}
            >
              <Check className="mr-1 inline h-3 w-3" />
              {saving ? t("knowledgeProposalSaving") : t("proposalAccept")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AIProposalCard({ toolCallId }: AIProposalCardProps) {
  const proposal = useProposalsStore((s) =>
    s.proposals.find((p) => p.toolCallId === toolCallId),
  );
  const { handleAccept, handleReject } = useProposalActions(proposal);
  const t = useTranslations("ai");

  const summary = useMemo(
    () => (proposal ? summarizeProposal(proposal) : null),
    [proposal],
  );

  if (!proposal || !summary) return null;

  const meta = TOOL_META[proposal.toolName] ?? TOOL_META.updateSection;
  const Icon = meta.icon;
  const sectionLabel =
    summary.affectedSectionTitles.length > 0
      ? summary.affectedSectionTitles.slice(0, 2).join("、") +
        (summary.affectedSectionTitles.length > 2 ? "…" : "")
      : "";

  return (
    <div className="my-2 flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--app-text)]">
        <Icon className="h-3 w-3 text-[var(--app-bg)]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-[var(--app-text)]">
          {t(meta.key, { section: sectionLabel })}
        </div>
        {summary.totalChanges > 0 && (
          <div className="text-[11px] text-[var(--app-text-muted)]">
            {t("proposalChangeCount", { count: summary.totalChanges })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleReject}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)]"
        >
          <Undo2 className="h-3 w-3" />
          {t("proposalReject")}
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--app-text)] px-2 py-1 text-[11px] font-medium text-[var(--app-bg)] transition-transform hover:scale-[1.03]"
        >
          <Check className="h-3 w-3" />
          {t("proposalAccept")}
        </button>
      </div>
    </div>
  );
}
