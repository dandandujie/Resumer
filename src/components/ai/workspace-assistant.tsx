import { useState } from "react";
import {
  Sparkles,
  Loader2,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { FIELD_LABELS, VALUE_LABELS } from "@/lib/workspace-actions";
import * as api from "@/lib/tauri-api";

type Props = {
  scope: api.WorkspaceScope;
  context: () => unknown;
  requestContext?: (base: unknown) => unknown;
  targetLabel?: (action: api.WorkspaceAction, base: unknown) => string;
  placeholder: string;
  examples?: string[];
  onApply?: (actions: api.WorkspaceAction[], base: unknown) => Promise<void>;
  onRead?: (source: api.WorkspaceCitation) => void;
  onSaveAnswer?: (answer: api.WorkspaceAnswer) => Promise<void>;
  title?: string;
  inputKey?: string;
};
export function WorkspaceAssistant({
  scope,
  context,
  requestContext,
  targetLabel,
  placeholder,
  examples = [],
  onApply,
  onRead,
  onSaveAnswer,
  title = "用一句话整理",
  inputKey,
}: Props) {
  const [text, setInput] = useState(() => {
      try { return inputKey ? localStorage.getItem(`resumer_assistant_input:${inputKey}`) || "" : ""; } catch { return ""; }
    }),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false),
    [error, setError] = useState("");
  const [engaged, setEngaged] = useState(scope === "upload" || scope === "wiki");
  const [draftError, setDraftError] = useState("");
  const setText = (value: string) => {
    setInput(value);
    if (inputKey) {
      try { localStorage.setItem(`resumer_assistant_input:${inputKey}`, value); setDraftError(""); }
      catch { setDraftError("这段输入暂时没能暂存，请在离开前复制保留。"); }
    }
  };
  const [proposal, setProposal] = useState<{
      answer: api.WorkspaceAnswer;
      base: unknown;
    } | null>(null),
    [applied, setApplied] = useState(false);
  const [reader, setReader] = useState<{
    title: string;
    content: string;
    assetId?: string;
    next?: number | null;
  } | null>(null);
  const read = async (citation: api.WorkspaceCitation) => {
    if (onRead) {
      onRead(citation);
      return;
    }
    try {
      if (citation.path)
        setReader({
          title: citation.title,
          content: await api.knowledgeRead(citation.path),
        });
      else if (citation.assetId) {
        const r = await api.libraryReadAsset(
          citation.assetId,
          citation.offset || 0,
        );
        setReader({
          title: citation.title,
          content: r.content,
          assetId: citation.assetId,
          next: r.nextOffset,
        });
      }
    } catch (e) {
      setError(String(e));
    }
  };
  const [history, setHistory] = useState<
    {
      question: string;
      reply: string;
      actions: api.WorkspaceAction[];
      applied: boolean;
    }[]
  >([]);
  const configured = useSettingsStore((s) =>
    Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()),
  );
  const ask = async () => {
    if (!text.trim() || busy || applying) return;
    if (!configured) {
      useUIStore.getState().setSettingsTab("ai");
      useUIStore.getState().openModal("settings");
      return;
    }
    setBusy(true);
    setError("");
    setOpen(true);
    try {
      const question = text.trim();
      const base = structuredClone(context());
      const now = new Date();
      const answer = await api.workspaceAssist(scope, question, {
        ...((requestContext ? requestContext(base) : base) as object),
        conversation: history.slice(-6),
        today: now.toLocaleDateString("sv-SE"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      answer.question = answer.question || question;
      setProposal({ answer, base });
      setApplied(false);
      setHistory((previous) => [
        ...previous,
        {
          question,
          reply: answer.reply,
          actions: answer.actions,
          applied: false,
        },
      ]);
      setText("");
    } catch (e) {
      setError((e as Error)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!engaged && !text && !proposal && !error && !draftError) return <div data-workspace-assistant={scope} className="flex items-center"><Button variant="ghost" size="sm" data-assistant-invitation onClick={() => { setEngaged(true); setOpen(true); }}><Sparkles className="size-3.5" />{scope === 'activity' ? '说一句，记下投递进展' : scope === 'application' ? '补充进展，或一起准备面试' : scope === 'library' ? '问问这些资料' : title}</Button></div>;
  return (
    <section
      data-workspace-assistant={scope}
      className="rounded-lg border bg-card"
    >
      <div className="flex items-start gap-2 p-3">
        <Sparkles className="mt-2 size-4 shrink-0 text-[var(--app-accent)]" />
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`assistant-${scope}`}>
            {title}
          </label>
          <Textarea
            id={`assistant-${scope}`}
            aria-label={title}
            disabled={busy || applying}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask();
              }
            }}
            rows={open ? 3 : 1}
            className="min-h-8 resize-none border-0 bg-transparent! p-1 shadow-none focus-visible:outline-none!"
            placeholder={placeholder}
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {busy
                ? "正在读取相关资料并整理…"
                : "想到哪儿说到哪儿，建议看过再采纳。"}
            </span>
            <Button
              size="xs"
              variant="primary"
              disabled={busy || applying || !text.trim()}
              onClick={() => void ask()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              {configured ? "交给 AI" : "配置 AI"}
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={open ? "收起自然语言助手" : "展开自然语言助手"}
          onClick={() => { setOpen(!open); if (open && !text && !proposal && !error) setEngaged(false); }}
        >
          <ChevronDown className={open ? "rotate-180" : ""} />
        </Button>
      </div>
      {(error || draftError) && <p role="alert" className="px-3 pb-3 text-xs text-destructive">{error || draftError}</p>}
      {!open && proposal && <Button variant="ghost" size="xs" className="mx-3 mb-3" onClick={() => setOpen(true)}>{applied ? "查看已采纳的建议" : "继续查看上次建议"}</Button>}
      {open && (
        <div className="space-y-3 border-t p-3">
          {!proposal && !busy && !!examples.length && (
            <div className="flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <button
                  type="button"
                  key={example}
                  className="max-w-full cursor-pointer rounded-md bg-muted px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setText(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
          {(proposal ? history.slice(0, -1) : history).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                此前讨论 · {(proposal ? history.slice(0, -1) : history).length}
              </summary>
              <div className="mt-2 space-y-2">
                {(proposal ? history.slice(0, -1) : history).map((turn, i) => (
                  <div key={i} className="rounded-md bg-muted p-2">
                    <p className="font-medium">{turn.question}</p>
                    <p className="mt-1 whitespace-pre-wrap leading-6">
                      {turn.reply}
                    </p>
                    {turn.applied && (
                      <p className="text-[10px] text-muted-foreground">
                        相关变更已应用
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
          {proposal && (
            <>
              <p className="text-[11px] font-medium text-muted-foreground">
                {proposal.answer.question}
              </p>
              <div
                data-app-reveal
                data-assistant-answer
                className="whitespace-pre-wrap text-xs leading-6"
              >
                {proposal.answer.reply}
              </div>
              {proposal.answer.actions.map((action, i) => (
                <div
                  key={i}
                  data-app-reveal
                  data-assistant-change
                  className="rounded-md border bg-background p-3"
                >
                  <p className="mb-1 text-xs font-semibold">
                    {targetLabel?.(action, proposal.base) ||
                      {
                        application: "投递记录",
                        interview: "面试轮次",
                        outcome: "投递结果",
                        collection: "资料集",
                        mock: "模拟面试",
                        wiki: "Wiki 页面",
                      }[action.kind]}
                  </p>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {action.reason}
                  </p>
                  <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    {Object.entries(action.fields).map(([key, value]) => (
                      <div className="contents" key={key}>
                        <dt className="text-muted-foreground">
                          {FIELD_LABELS[key] || key}
                        </dt>
                        <dd className="break-words whitespace-pre-wrap">
                          {VALUE_LABELS[String(value)] ||
                            String(value) ||
                            "（清空）"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {!!proposal.answer.citations.length && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    依据 · 引用原文已校验
                  </p>
                  {proposal.answer.citations.map((citation, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => void read(citation)}
                      className="block w-full cursor-pointer rounded-md bg-muted/50 p-2 text-left text-xs disabled:cursor-default"
                    >
                      <span className="flex items-center gap-1 font-medium">
                        <FileText className="size-3" />
                        {citation.title}
                      </span>
                      <span className="mt-1 block line-clamp-3 text-muted-foreground">
                        “{citation.quote}”
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!!proposal.answer.actions.length && onApply && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || applying || applied}
                    onClick={async () => {
                      setApplying(true);
                      setError("");
                      try {
                        await onApply(proposal.answer.actions, proposal.base);
                        setApplied(true);
                        setHistory((previous) =>
                          previous.map((turn, i) =>
                            i === previous.length - 1
                              ? { ...turn, applied: true }
                              : turn,
                          ),
                        );
                      } catch (e) {
                        setError((e as Error)?.message || String(e));
                      } finally {
                        setApplying(false);
                      }
                    }}
                  >
                    {applying ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Check />
                    )}
                    {applied ? "已应用" : "应用这些变更"}
                  </Button>
                )}
                {!proposal.answer.actions.length &&
                  proposal.answer.citations.length > 0 &&
                  onSaveAnswer && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || applying || applied}
                      onClick={async () => {
                        setApplying(true);
                        setError("");
                        try {
                          await onSaveAnswer(proposal.answer);
                          setApplied(true);
                          setHistory((previous) =>
                            previous.map((turn, i) =>
                              i === previous.length - 1
                                ? { ...turn, applied: true }
                                : turn,
                            ),
                          );
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setApplying(false);
                        }
                      }}
                    >
                      {applied ? "已沉淀到 Wiki" : "保存为 Wiki 综合页"}
                    </Button>
                  )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || applying}
                  onClick={() => {
                    setProposal(null);
                    setApplied(false);
                  }}
                >
                  <X />
                  {applied || !proposal.answer.actions.length
                    ? "关闭结果"
                    : "放弃本次结果"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <Dialog
        open={!!reader}
        onOpenChange={(open) => {
          if (!open) setReader(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>{reader?.title}</DialogTitle>
            <DialogDescription>来源正文 · 可核对回答依据</DialogDescription>
          </DialogHeader>
          <pre className="min-h-0 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">
            {reader?.content}
          </pre>
          {reader?.assetId && reader.next != null && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await api.libraryReadAsset(
                    reader.assetId!,
                    reader.next!,
                  );
                  setReader({
                    ...reader,
                    content: reader.content + "\n" + r.content,
                    next: r.nextOffset,
                  });
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              继续阅读来源
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
