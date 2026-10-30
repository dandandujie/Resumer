"use client";

import { Pencil, Eye, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";

export function EditorMobileTabBar({ onOpenSections }: { onOpenSections: () => void }) {
  const t = useTranslations("editor");
  const { mobileActiveTab, setMobileActiveTab } = useEditorStore();

  return (
    <div className="flex shrink-0 border-b border-[var(--app-border)] bg-[var(--app-sidebar)] md:hidden">
      <button type="button" onClick={onOpenSections} className="flex items-center justify-center gap-1.5 border-r border-[var(--app-border)] px-3 py-2 text-xs text-[var(--app-text-muted)]">
        <List className="h-4 w-4" />{t('sidebar.sections')}
      </button>
      <button
        aria-pressed={mobileActiveTab === 'edit'}
        onClick={() => setMobileActiveTab("edit")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors md:hidden",
          mobileActiveTab === "edit"
            ? "border-b-2 border-[var(--app-accent)] text-[var(--app-text)]"
            : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
        )}
      >
        <Pencil className="h-4 w-4" />
        {t("edit")}
      </button>
      <button
        aria-pressed={mobileActiveTab === 'preview'}
        onClick={() => setMobileActiveTab("preview")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors md:hidden",
          mobileActiveTab === "preview"
            ? "border-b-2 border-[var(--app-accent)] text-[var(--app-text)]"
            : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
        )}
      >
        <Eye className="h-4 w-4" />
        {t("preview")}
      </button>
    </div>
  );
}
