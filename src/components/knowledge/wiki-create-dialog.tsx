import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import * as api from "@/lib/tauri-api";
export function WikiCreateDialog({
  kind,
  folder,
  folders,
  pages,
  onClose,
  onCreated,
}: {
  kind: "note" | "folder";
  folder: string;
  folders: string[];
  pages: api.KnowledgePageSummary[];
  onClose: () => void;
  onCreated: (path: string) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [parent, setParent] = useState(
      folder.startsWith("wiki") ? folder : "wiki/guides",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const safe = name
        .trim()
        .replace(/[<>:"/\\|?*]/g, "-")
        .replace(/[. ]+$/, "").split("").filter(c=>c.charCodeAt(0)>=32).join("");
      if (!safe) throw Error("请填写有效名称");
      let path = `${parent}/${safe}`;
      if (kind === "folder") await api.knowledgeCreateFolder(path);
      else {
        let suffix = 1;
        while (pages.some((p) => p.path === path + ".md"))
          path = `${parent}/${safe} ${++suffix}`;
        path += ".md";
        const segment = parent.split("/")[1];
        const types: Record<string, string> = {
          companies: "company",
          roles: "role",
          concepts: "concept",
          experiences: "experience",
          questions: "question",
          guides: "guide",
          sources: "source",
          market: "market",
          sops: "sop",
          skills: "skill",
        };
        await api.knowledgeCreatePage({
          path,
          title: name.trim(),
          kind: types[segment] || "note",
          body: `# ${name.trim()}\n\n`,
        });
      }
      await onCreated(path);
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
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent data-wiki-create>
        <DialogHeader>
          <DialogTitle>
            {kind === "note" ? "新建笔记" : "新建文件夹"}
          </DialogTitle>
          <DialogDescription>
            {kind === "note"
              ? "保存在本机 Wiki 中，可继续编辑、链接或交给 AI 整理。"
              : "文件夹用于归位笔记；标签用于跨目录查找。"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <label className="block space-y-2 text-xs">
            名称
            <Input
              autoFocus
              aria-label={kind === "note" ? "Wiki笔记名称" : "Wiki文件夹名称"}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block space-y-2 text-xs">
            保存位置
            <select
              aria-label="Wiki保存位置"
              className="app-select w-full"
              value={parent}
              disabled={busy}
              onChange={(e) => setParent(e.target.value)}
            >
              {[...new Set([...folders, parent])].sort().map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !name.trim()}
            >
              {busy && <Loader2 className="animate-spin" />}创建
              {kind === "note" ? "笔记" : "文件夹"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
