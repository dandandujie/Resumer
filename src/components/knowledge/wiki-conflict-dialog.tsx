import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export type WikiConflict = {
  path: string;
  text: string;
  onDisk: string;
  draft: unknown;
};
export function WikiConflictDialog({
  conflict,
  onClose,
  onResolve,
}: {
  conflict: WikiConflict;
  onClose: () => void;
  onResolve: (choice: "disk" | "draft") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const resolve = async (choice: "disk" | "draft") => {
    setBusy(true);
    setError("");
    try {
      await onResolve(choice);
      onClose();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col sm:max-w-4xl"
        data-wiki-conflict
      >
        <DialogHeader>
          <DialogTitle>笔记在其他地方更新了</DialogTitle>
          <DialogDescription>
            比较磁盘版本和当前草稿，再决定保留哪一份。当前尚未覆盖文件。
          </DialogDescription>
        </DialogHeader>
        <p className="break-all text-[10px] text-muted-foreground">
          {conflict.path}
        </p>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto sm:grid-cols-2">
          {[
            { label: "当前磁盘版本", text: conflict.onDisk },
            { label: "我的未保存草稿", text: conflict.text },
          ].map((row) => (
            <section key={row.label} className="min-w-0 rounded-md border p-3">
              <h3 className="mb-2 text-xs font-semibold">{row.label}</h3>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">
                {row.text}
              </pre>
            </section>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            继续保留草稿
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void resolve("disk")}
          >
            使用磁盘版本
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void resolve("draft")}
          >
            保留我的草稿并保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
