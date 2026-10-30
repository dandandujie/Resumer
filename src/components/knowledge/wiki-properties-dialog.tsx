import { useState } from "react";
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
import { TagInput } from "./tag-input";
import * as api from "@/lib/tauri-api";
export function WikiPropertiesDialog({
  page,
  content,
  suggestions,
  onClose,
  onSaved,
}: {
  page: api.KnowledgePageSummary;
  content: string;
  suggestions: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(page.title),
    [tags, setTags] = useState(page.tags),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent data-wiki-properties-editor>
        <DialogHeader>
          <DialogTitle>编辑笔记属性</DialogTitle>
          <DialogDescription>
            标题和标签会写入 Markdown 属性区；文件路径与其他自定义属性保留。
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-xs">
          标题
          <Input
            autoFocus
            aria-label="Wiki笔记标题"
            maxLength={160}
            disabled={busy}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="space-y-2 text-xs">
          <label>标签</label>
          <TagInput
            label="Wiki笔记标签"
            value={tags}
            onChange={setTags}
            suggestions={suggestions}
            disabled={busy}
          />
        </div>
        <p className="break-all text-[10px] text-muted-foreground">
          {page.path}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api.knowledgeUpdateProperties(
                  page.path,
                  title,
                  tags,
                  content,
                );
                await onSaved();
                onClose();
              } catch (e) {
                setError(String((e as Error)?.message || e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在保存" : "保存属性"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
