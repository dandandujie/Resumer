import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settings-store";
export function AutoSaveToggle() {
  const t = useTranslations("editor.toolbar");
  const enabled = useSettingsStore((s) => s.autoSave);
  const hydrated = useSettingsStore((s) => s._hydrated);
  const set = useSettingsStore((s) => s.setAutoSave);
  return (
    <label className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-[var(--app-text-secondary)]">
      <Switch
        aria-label={t("autoSave")}
        checked={enabled}
        disabled={!hydrated}
        onCheckedChange={set}
      />
      {t("autoSave")}
    </label>
  );
}
