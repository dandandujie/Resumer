import { useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  FileText,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import * as api from "@/lib/tauri-api";
import { useSettingsStore } from "@/stores/settings-store";
import { stripFrontmatter } from "@/lib/knowledge-page";

type Result = Awaited<ReturnType<typeof api.knowledgeApplyDraft>>;
export function KnowledgeDraftDialog({
  draft,
  onClose,
  onApplied,
  onNext,
}: {
  draft: api.KnowledgeDraft;
  onClose: () => void;
  onApplied: (result: Result) => void;
  onNext?: (draft: api.KnowledgeDraft) => void;
}) {
  const [text, setText] = useState(draft.payload.markdown || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<Result | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [compile, setCompile] = useState(true);
  const configured = useSettingsStore((s) =>
    Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()),
  );

  const close = async () => {
    if (busy && !saved) return;
    if (
      draft.kind === "distill" &&
      !saved &&
      text !== (draft.payload.markdown || "")
    ) {
      setBusy(true);
      try {
        await api.knowledgeUpdateDraft(draft.id, text);
        onClose();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    } else onClose();
  };
  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.knowledgeApplyDraft(
        draft.id,
        draft.kind === "distill" ? text : undefined,
      );
      setSaved(result);
      onApplied(result);
      toast.success(
        draft.kind === "distill"
          ? "提炼内容已沉淀，原件与转写稿保留"
          : "Wiki更新已保存",
      );
      if (
        compile &&
        draft.kind === "distill" &&
        result.collectionId &&
        onNext
      ) {
        try {
          const next = await api.knowledgeCompilePrepare(result.collectionId);
          if (alive.current) onNext(next);
          else toast.success("Wiki更新建议已保存在知识库「待采纳」中");
        } catch (e) {
          const message = `提炼内容已保存；Wiki整理未完成：${(e as Error)?.message || String(e)}。可稍后从资料集继续整理。`;
          if (alive.current) setError(message);
          else toast.error(message);
        }
      }
    } catch (e) {
      setError((e as Error)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent
        showCloseButton={!(busy && !saved)}
        data-knowledge-draft
        className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl"
      >
        <DialogHeader className="border-b p-5">
          <DialogTitle>{draft.payload.title || "知识更新建议"}</DialogTitle>
          <DialogDescription>
            {draft.kind === "distill"
              ? "校对提炼内容，再沉淀为可检索知识。完整转写不会默认进入知识索引。"
              : "原件保持不变；确认后一起更新页面、索引和双链。来源或页面变化时会阻止覆盖。"}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {draft.payload.coverage && (
            <p className="text-xs text-muted-foreground">
              本次已处理{" "}
              {draft.payload.coverage.files ??
                draft.payload.coverage.pages ??
                1}{" "}
              {draft.payload.coverage.pages ? "个页面" : "个文件"}
              {draft.payload.coverage.chunks
                ? ` · ${draft.payload.coverage.chunks} 个全文分段`
                : ""}
            </p>
          )}
          {!!draft.payload.coverage?.skipped?.length && (
            <div className="rounded-md bg-muted p-3 text-xs leading-6">
              {draft.payload.coverage.skipped.length} 份素材暂未编译：
              {draft.payload.coverage.skipped.map((s) => s.filename).join("、")}
              。请先转写/提炼或完成 OCR。
            </div>
          )}
          {draft.kind === "distill" ? (
            <>
              <label className="block space-y-2 text-xs font-medium">
                提炼内容 · 可修改
                <Textarea
                  aria-label="AI提炼内容"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy || !!saved}
                  rows={15}
                  className="text-xs leading-6"
                />
              </label>
              {!!draft.payload.evidence?.length && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    核对来源证据 · {draft.payload.evidence.length}
                  </summary>
                  <div className="mt-3 space-y-2 text-xs leading-6">
                    {draft.payload.evidence.map((e, i) => (
                      <blockquote
                        key={i}
                        className="border-l-2 pl-3 text-muted-foreground"
                      >
                        {e.quote}
                      </blockquote>
                    ))}
                  </div>
                </details>
              )}
              {configured && onNext && (
                <label className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-xs">
                  <span>
                    沉淀后继续生成 Wiki 更新建议
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      归入已有公司、岗位与概念页，不停留在孤立摘要。
                    </span>
                  </span>
                  <Switch
                    aria-label="沉淀后整理Wiki"
                    checked={compile}
                    onCheckedChange={setCompile}
                    disabled={busy || !!saved}
                  />
                </label>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {draft.payload.pages?.map((page) => (
                <details
                  key={page.path}
                  className="group rounded-lg border bg-card"
                  data-wiki-page-change
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 p-3">
                    <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
                    <FileText className="size-4 shrink-0" />
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-medium"
                      title={page.title}
                    >
                      {page.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {page.before ? "更新" : "新建"}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t p-3">
                    {page.before && (
                      <details>
                        <summary className="cursor-pointer text-[11px] text-muted-foreground">
                          查看修改前内容
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-6">
                          {stripFrontmatter(page.before)}
                        </pre>
                      </details>
                    )}
                    <pre className="whitespace-pre-wrap break-words text-xs leading-6">
                      {page.body}
                    </pre>
                    <p className="break-all text-[10px] text-muted-foreground">
                      {page.path}
                    </p>
                  </div>
                </details>
              ))}
              {!draft.payload.pages?.length && (
                <p className="rounded-md bg-muted p-4 text-xs">
                  本次没有需要改写的页面。可以查看维护发现和建议补充的问题。
                </p>
              )}
            </div>
          )}
          {(["conflicts", "insights", "questions"] as const).map((key) =>
            draft.payload[key]?.length ? (
              <section key={key} className="rounded-md bg-muted/50 p-3">
                <h3 className="mb-2 text-xs font-semibold">
                  {
                    {
                      conflicts: "冲突与不确定性",
                      insights: "整理发现",
                      questions: "值得继续追问",
                    }[key]
                  }
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-6">
                  {draft.payload[key]!.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {!!draft.payload.structural?.issues?.length && (
            <details className="text-xs">
              <summary className="cursor-pointer">
                结构检查 · {draft.payload.structural.issues.length}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                {draft.payload.structural.issues.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          {error && (
            <p role="alert" className="text-xs leading-6 text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="items-center border-t p-4">
          <span className="mr-auto text-[10px] text-muted-foreground">
            {busy
              ? "正在处理，完成结果会保留"
              : saved
                ? "已保存；可在资料集与Wiki继续查看"
                : "提案已保存在本机，稍后仍可回来处理"}
          </span>
          {!saved && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.knowledgeDiscardDraft(draft.id);
                  onClose();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              放弃提案
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy && !saved}
            onClick={() => void close()}
          >
            {saved ? (busy ? "后台继续，先关闭" : "完成") : "稍后处理"}
          </Button>
          {!saved && (
            <Button
              size="sm"
              variant="primary"
              disabled={
                busy ||
                (draft.kind === "distill"
                  ? !text.trim()
                  : !draft.payload.pages?.length)
              }
              onClick={() => void apply()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {busy
                ? "处理中"
                : draft.kind === "distill"
                  ? "沉淀为知识"
                  : "采纳这批更新"}
            </Button>
          )}
          {saved && !!saved.pages.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void api.knowledgeOpenVault()}
            >
              <ExternalLink />
              打开 Wiki 文件夹
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
