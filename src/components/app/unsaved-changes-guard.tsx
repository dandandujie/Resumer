import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  useUnsavedStore,
  hasUnsaved,
  saveUnsaved,
  discardUnsaved,
} from "@/stores/unsaved-store";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function UnsavedChangesGuard() {
  const blocker = useBlocker(() => hasUnsaved());
  const request = useUnsavedStore((s) => s.request);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations("unsaved");
  useEffect(() => {
    if (blocker.state === "blocked") useUnsavedStore.getState().ask(() => blocker.proceed());
  }, [blocker]);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    if (isTauri())
      void listen("app-close-requested", () => {
        useUnsavedStore.getState().ask(async () => {
          await invoke("finish_app_exit");
        });
      }).then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        stop = unlisten;
        await invoke("set_exit_guard_ready", { ready: true });
      }).catch(() => toast.error("无法启用退出确认，请先手动保存并重启应用。"));
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isTauri() && hasUnsaved()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      disposed = true;
      stop?.();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  const cancel = () => {
    if (!busy) {
      setError("");
      if (blocker.state === "blocked") blocker.reset();
      useUnsavedStore.getState().clear();
    }
  };
  const finish = async (save: boolean) => {
    if (!request) return;
    setBusy(true);
    setError("");
    try {
      if (save) await saveUnsaved(request.scope);
      else await discardUnsaved(request.scope);
      useUnsavedStore.getState().clear();
      await request.action();
    } catch (cause) {
      const message = String((cause as Error)?.message || cause);
      setError(message);
      if (!useUnsavedStore.getState().request) toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <AlertDialogContent data-unsaved-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(request?.kind === "required" ? "requiredTitle" : "title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(request?.kind === "required" ? "requiredBody" : "body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="break-words text-sm text-red-700">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={busy} onClick={cancel}>
            {t("cancel")}
          </AlertDialogCancel>
          {request?.kind === "leave" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void finish(false)}
            >
              {t("discard")}
            </Button>
          )}
          <Button variant="primary" disabled={busy} onClick={() => void finish(true)}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t(request?.kind === "required" ? "saveContinue" : "saveLeave")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
