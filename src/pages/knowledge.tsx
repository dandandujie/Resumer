import { listen } from "@tauri-apps/api/event";
import { KnowledgeDraftDialog } from "@/components/knowledge/draft-dialog";
import { KnowledgeDraftMenu } from "@/components/knowledge/draft-menu";
import { AudioWorkbench } from "@/components/knowledge/audio-workbench";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useKnowledgeStore } from "@/stores/knowledge-store";
import { useUnsavedStore } from "@/stores/unsaved-store";
import { cn } from "@/lib/utils";
import * as api from "@/lib/tauri-api";
import KnowledgeWiki from "./knowledge-wiki";
import { TagFilter } from "@/components/knowledge/tag-filter";
import { TagInput } from "@/components/knowledge/tag-input";
import {
  collectionTags,
  countTags,
  matchesTags,
  normalizeTags,
  EMPTY_TAG_FILTER,
  type TagFilterState,
} from "@/lib/knowledge-tags";
import { WorkspaceAssistant } from "@/components/ai/workspace-assistant";
import {
  assertUnchanged,
  validateWorkspaceFields,
} from "@/lib/workspace-actions";

type Kind = "document" | "skill";
const describe = (error: unknown) => String((error as Error)?.message || error);
const caption: Record<api.LibraryAsset["status"], string> = {
  ready: "可检索",
  error: "解析失败",
  needs_ocr: "需要 OCR",
  needs_transcription: "待转写",
  needs_distillation: "待提炼",
  archived_transcript: "历史素材（不参与检索）",
};
export default function KnowledgePage() {
  const [view, setView] = useState<"library" | "wiki">(() =>
    useKnowledgeStore.getState().pendingOpen ? "wiki" : "library",
  );
  const [kind, setKind] = useState<Kind>("document");
  const [collections, setCollections] = useState<api.LibraryCollection[]>([]);
  const [selected, setSelected] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilterState>({
    ...EMPTY_TAG_FILTER,
  });
  const [filter, setFilter] = useState("");
  const [fileData, setFileData] = useState<{
    collectionId: string;
    files: api.LibraryAsset[];
  }>({ collectionId: "", files: [] });
  const files = fileData.collectionId === selected ? fileData.files : [];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<{
    kind: Kind;
    collection?: api.LibraryCollection;
  } | null>(null);
  const [editing, setEditing] = useState<api.LibraryCollection | null>(null);
  const [reader, setReader] = useState<api.LibraryRead | null>(null);
  const [reading, setReading] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<api.LibraryHit[] | null>(null);
  const [draft, setDraft] = useState<api.KnowledgeDraft | null>(null);
  const [audio, setAudio] = useState<api.LibraryAsset | null>(null);
  const [revision, setRevision] = useState(0);
  const [task, setTask] = useState("");
  const [progress, setProgress] = useState<{
    stage: string;
    source: string;
    done: number;
    total: number;
  } | null>(null);
  const aiConfigured = useSettingsStore((s) =>
    Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()),
  );
  useEffect(() => {
    const p = listen<{
      stage: string;
      source: string;
      done: number;
      total: number;
    }>("knowledge-progress", (e) => setProgress(e.payload));
    return () => {
      void p.then((fn) => fn());
    };
  }, []);
  const runKnowledge = async (
    label: string,
    fn: () => Promise<api.KnowledgeDraft>,
  ) => {
    if (task) return;
    if (!aiConfigured) {
      useUIStore.getState().setSettingsTab("ai");
      useUIStore.getState().openModal("settings");
      return;
    }
    setTask(label);
    setProgress(null);
    try {
      setDraft(await fn());
      toast.success("知识更新建议已保存在「待采纳」中");
      setRevision((r) => r + 1);
    } catch (e) {
      toast.error(describe(e));
    } finally {
      setTask("");
      setProgress(null);
    }
  };
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const hasCollections = collections.some((item) => item.kind === kind);
  const current = collections.find((item) => item.id === selected);
  const refresh = useCallback(async () => {
    try {
      setCollections(await api.libraryCollections());
      setError("");
    } catch (error) {
      setError(describe(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const start = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(start);
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    if (selected)
      void api
        .libraryAssets(selected)
        .then((value) => {
          if (!cancelled) setFileData({ collectionId: selected, files: value });
        })
        .catch((error) => {
          if (!cancelled) toast.error(describe(error));
        });
    return () => {
      cancelled = true;
    };
  }, [selected, collections]);
  const openFile = async (id: string, offset = 0) => {
    setReading(true);
    try {
      setReader(await api.libraryReadAsset(id, offset));
    } catch (error) {
      toast.error(describe(error));
    } finally {
      setReading(false);
    }
  };
  const runSearch = async () => {
    if (!query.trim()) {
      setHits(null);
      return;
    }
    setSearching(true);
    setSearchError("");
    try {
      setHits(
        await api.librarySearch(
          query.trim(),
          undefined,
          undefined,
          kind,
          tagFilter,
        ),
      );
    } catch (error) {
      setSearchError(describe(error));
    } finally {
      setSearching(false);
    }
  };
  const visible = collections.filter(
    (item) =>
      item.kind === kind &&
      matchesTags(collectionTags(item), tagFilter) &&
      `${item.title} ${item.purpose} ${collectionTags(item).join(" ")}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const tagCounts = countTags(collections.filter((item) => item.kind === kind));
  const categories = tagCounts.map((t) => t.name);
  return (
    <div
      className="knowledge-workspace flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-text)]"
      data-library-workspace
    >
      {view === "library" ? (
        <header className="app-page-header mb-4 shrink-0">
          <div>
            <p className="app-eyebrow">KNOWLEDGE</p>
            <h1 className="app-page-title">知识库</h1>
            <p className="app-page-description">
              按主题整理资料，用标签串联每一次准备。
            </p>
          </div>
          <div className="app-actions">
            <KnowledgeDraftMenu revision={revision} onSelect={setDraft} />
            {hasCollections && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setBatch({ kind })}
              >
                <Plus />
                {kind === "skill" ? "上传 Skill" : "新建资料集"}
              </Button>
            )}
          </div>
        </header>
      ) : null}
      {task && (
        <div
          role="status"
          className="mb-3 flex shrink-0 items-center gap-2 rounded-md bg-card p-3 text-xs"
        >
          <Loader2 className="size-4 animate-spin" />
          {task}
          {progress && (
            <span
              className="min-w-0 truncate text-muted-foreground"
              title={progress.source}
            >
              {progress.source} · {progress.done + 1}/{progress.total}
            </span>
          )}
        </div>
      )}
      <div
        className={`app-toolbar shrink-0 ${view === "wiki" ? "mb-2" : "mb-4"}`}
      >
        <div className="app-segments" role="tablist" aria-label="知识库视图">
          <button
            type="button"
            role="tab"
            aria-selected={view === "library"}
            onClick={() =>
              useUnsavedStore.getState().ask(() => setView("library"))
            }
          >
            资料集
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "wiki"}
            onClick={() => setView("wiki")}
          >
            求职 Wiki
          </button>
        </div>
        {view === "library" && (
          <div className="app-segments" role="tablist" aria-label="资料类型">
            {(["document", "skill"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                onClick={() => {
                  setKind(value);
                  setTagFilter({ ...EMPTY_TAG_FILTER });
                  setSelected("");
                  setHits(null);
                }}
              >
                {value === "document" ? (
                  <Layers className="size-3.5" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {value === "document" ? "资料文档" : "Skill 技能"}
              </button>
            ))}
          </div>
        )}
        {view === "wiki" && (
          <KnowledgeDraftMenu revision={revision} onSelect={setDraft} />
        )}
      </div>
      {view === "wiki" ? (
        <div className="min-h-0 flex-1">
          <KnowledgeWiki
            onChange={() => setRevision((r) => r + 1)}
            onAddSource={() =>
              useUnsavedStore.getState().ask(() => {
                setView("library");
                setKind("document");
                setBatch({ kind: "document" });
              })
            }
          />
        </div>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 bg-red-50 px-5 py-3 text-sm text-red-800"
            >
              {error}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                重试
              </Button>
            </div>
          )}
          <div className="mb-3 max-h-[45vh] shrink-0 overflow-y-auto">
            <WorkspaceAssistant
              scope="library"
              title="与资料库对话"
              placeholder={
                current
                  ? `问「${current.title}」的资料、提炼准备重点，或描述该打哪些标签…`
                  : "询问已有资料，或描述要建立什么主题、怎样打标签…"
              }
              examples={[
                "根据这些资料，整理面试准备重点并给出来源",
                "帮我建立一个星河科技面试资料集，打上「前端」和「面试」标签",
              ]}
              context={() => ({
                collectionId: current?.id,
                collections: collections.filter((c) => c.kind === kind),
              })}
              targetLabel={(action, base) =>
                (
                  base as { collections: api.LibraryCollection[] }
                ).collections.find((c) => c.id === action.targetId)?.title ||
                "新建资料集"
              }
              onSaveAnswer={async (answer) => {
                const path = await api.knowledgeSaveAnswer(answer);
                useKnowledgeStore.setState({
                  pendingOpen: { path, edit: false },
                });
                setView("wiki");
              }}
              onApply={async (actions, base) => {
                const before = (
                  base as { collections: api.LibraryCollection[] }
                ).collections;
                const latest = await api.libraryCollections();
                for (const action of actions) {
                  validateWorkspaceFields(action);
                  if (action.kind !== "collection")
                    throw Error("不是资料集整理操作");
                  if (action.targetId) {
                    const old = before.find((c) => c.id === action.targetId),
                      now = latest.find((c) => c.id === action.targetId);
                    if (!old || !now) throw Error("资料集不存在");
                    assertUnchanged(old, now);
                  }
                }
                const grouped = new Map<string, api.WorkspaceAction>();
                actions.forEach((action, i) => {
                  const key = action.targetId || "new:" + i;
                  const prior = grouped.get(key);
                  grouped.set(key, {
                    ...action,
                    fields: { ...prior?.fields, ...action.fields },
                  });
                });
                for (const action of grouped.values()) {
                  if (
                    action.fields.category !== undefined &&
                    !Array.isArray(action.fields.tags)
                  )
                    action.fields.tags = normalizeTags([
                      String(action.fields.category),
                    ]);
                  const old = latest.find((c) => c.id === action.targetId);
                  const id = await api.libraryPutCollection({
                    ...old,
                    title: old?.title || "",
                    purpose: old?.purpose || "",
                    category: old?.category || "",
                    kind,
                    enabled: old?.enabled ?? true,
                    ...action.fields,
                  });
                  setSelected(id);
                }
                await refresh();
              }}
            />
          </div>
          {!loading && !hasCollections ? (
            <section className="app-empty flex-1 rounded-[10px] bg-[var(--app-surface)]">
              <FolderOpen className="size-8" />
              <h2 className="text-base font-semibold text-foreground">
                {kind === "skill"
                  ? "添加 AI 可调用的技能"
                  : "围绕一个主题，收好所有资料"}
              </h2>
              <p className="max-w-md text-xs leading-6">
                {kind === "skill"
                  ? "上传 SKILL.md 或 ZIP 技能包，与普通资料独立管理。"
                  : "例如「星河科技面试」：一次加入面经 PDF、岗位 DOCX 和题目表格，无需按格式重复上传。"}
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setBatch({ kind })}
              >
                <Plus />
                {kind === "skill" ? "上传 Skill" : "新建资料集"}
              </Button>
            </section>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto rounded-[10px] border border-[var(--app-border)] lg:grid-cols-[260px_1fr] lg:overflow-hidden">
              <aside
                className={cn(
                  "flex min-h-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-surface-muted)]",
                  current && "hidden lg:flex",
                )}
              >
                <div className="space-y-2 border-b border-[var(--app-border)] p-3">
                  <Input
                    aria-label="筛选资料集"
                    placeholder="按名称或用途筛选…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <TagFilter
                    value={tagFilter}
                    onChange={(value) => {
                      setTagFilter(value);
                      if (
                        current &&
                        !matchesTags(collectionTags(current), value)
                      )
                        setSelected("");
                      setHits(null);
                    }}
                    items={tagCounts}
                    total={collections.filter((c) => c.kind === kind).length}
                    untaggedCount={
                      collections.filter(
                        (c) => c.kind === kind && !collectionTags(c).length,
                      ).length
                    }
                  />

                  <p className="pt-1 text-[10px] text-muted-foreground">
                    资料集 · {visible.length}
                    {filter && " 个匹配"}
                  </p>
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                  {loading ? (
                    <p className="p-5 text-sm">正在读取资料集…</p>
                  ) : visible.length ? (
                    visible.map((item) => (
                      <button
                        key={item.id}
                        data-collection-id={item.id}
                        onClick={() => {
                          setSelected(item.id);
                          setHits(null);
                        }}
                        aria-pressed={selected === item.id}
                        className={cn(
                          "w-full cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                          selected === item.id
                            ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                            : "border-transparent bg-transparent hover:bg-[var(--app-hover)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="break-words font-semibold">
                            {item.title}
                          </h3>
                          <ChevronRight className="size-4 shrink-0" />
                        </div>
                        <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-[var(--app-text-muted)]">
                          {item.purpose ||
                            (item.kind === "skill"
                              ? "可供 AI 调用的技能"
                              : "按主题保存的原始资料")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                          <span>
                            {item.assetCount} 个文件 · {item.readyCount}{" "}
                            个可检索
                          </span>
                          {!!collectionTags(item).length && (
                            <span
                              className="max-w-full basis-full truncate text-[10px]"
                              title={collectionTags(item)
                                .map((t) => "#" + t)
                                .join("  ")}
                            >
                              {collectionTags(item)
                                .map((t) => "#" + t)
                                .join("  ")}
                            </span>
                          )}
                          {!item.enabled && <span>已停用</span>}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="m-2 rounded-[10px] border border-dashed border-[var(--app-border)] p-6 text-sm leading-relaxed text-[var(--app-text-muted)]">
                      {filter || tagFilter.tags.length > 0 || tagFilter.untagged
                        ? "没有匹配的资料集"
                        : kind === "skill"
                          ? "上传 SKILL.md 或 ZIP 技能包。技能和普通资料独立存放，可随时启停。"
                          : "例如新建「星河科技面试」，一次加入面经 PDF、岗位 DOCX 和题目表格。"}
                    </div>
                  )}
                </div>
              </aside>
              <main
                className={cn(
                  "min-h-0 overflow-y-auto bg-[var(--app-bg)] p-4 md:p-5",
                  !current && "hidden lg:block",
                )}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 lg:hidden"
                  onClick={() => setSelected("")}
                >
                  <ArrowLeft />
                  所有资料集
                </Button>
                {current ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>资料集</span>
                          {collectionTags(current).map((tag) => (
                            <button
                              type="button"
                              key={tag}
                              className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5 hover:bg-accent"
                              title={tag}
                              onClick={() => {
                                setTagFilter({
                                  tags: [tag],
                                  match: "all",
                                  untagged: false,
                                });
                                setHits(null);
                              }}
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>

                        <h2 className="mt-1 break-words text-xl font-semibold">
                          {current.title}
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(current)}
                        >
                          <Pencil />
                          编辑资料集
                        </Button>
                        {kind === "document" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!task || current.readyCount === 0}
                            onClick={() =>
                              void runKnowledge("正在编译 Wiki", () =>
                                api.knowledgeCompilePrepare(current.id),
                              )
                            }
                          >
                            <Sparkles />
                            整理 / 更新 Wiki
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() =>
                            setBatch({
                              kind: current.kind,
                              collection: current,
                            })
                          }
                        >
                          <Upload />
                          批量添加{kind === "skill" ? " Skill" : "资料"}
                        </Button>
                      </div>
                    </div>
                    {current.purpose && (
                      <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[var(--app-surface)] p-3 text-xs leading-6 text-[var(--app-text-secondary)]">
                        {current.purpose}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{files.length} 个文件</span>
                      <span>{current.readyCount} 个可检索</span>
                      <span>
                        {current.kind === "skill" ? "Skill 技能" : "资料文档"}
                      </span>
                    </div>
                    {kind === "skill" && (
                      <label className="mt-4 flex items-center gap-3 text-sm">
                        <Switch
                          checked={current.enabled}
                          onCheckedChange={async (enabled) => {
                            try {
                              await api.libraryPutCollection({
                                ...current,
                                enabled,
                              });
                              await refresh();
                            } catch (error) {
                              toast.error(describe(error));
                            }
                          }}
                          aria-label="允许 AI 使用此 Skill"
                        />
                        允许 AI 使用此 Skill
                        <span className="text-xs text-[var(--app-text-muted)]">
                          {current.enabled
                            ? "已启用，可检索和阅读"
                            : "已停用，不提供给 AI"}
                        </span>
                      </label>
                    )}
                    <div className="mt-6 flex items-center justify-between">
                      <h3 className="font-semibold">
                        文件{" "}
                        <span className="ml-1 text-sm font-normal text-[var(--app-text-muted)]">
                          {files.length}
                        </span>
                      </h3>
                      <span className="text-xs text-[var(--app-text-muted)]">
                        保留原件 · 相同文件自动去重
                      </span>
                    </div>
                    <div className="mt-3 divide-y divide-[var(--app-border)] rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface)]">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3"
                        >
                          <span className="w-11 shrink-0 rounded-md bg-[var(--app-hover)] py-2 text-center text-[10px] font-semibold uppercase">
                            {file.extension}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-medium">
                              {file.filename}
                            </div>
                            <p
                              className={cn(
                                "mt-1 text-xs",
                                file.status === "ready"
                                  ? "text-[var(--app-accent)]"
                                  : "text-amber-800",
                              )}
                            >
                              {caption[file.status]}
                              {file.status === "ready"
                                ? ` · ${file.characters.toLocaleString()} 字`
                                : file.error
                                  ? ` · ${file.error}`
                                  : ""}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={
                                (!api.isAudioAsset(file.filename) &&
                                  file.status !== "ready") ||
                                reading
                              }
                              onClick={() =>
                                api.isAudioAsset(file.filename)
                                  ? setAudio(file)
                                  : void openFile(file.id)
                              }
                            >
                              <FileText />
                              {api.isAudioAsset(file.filename)
                                ? "转写 / 知识"
                                : "查看原文"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void api
                                  .libraryOpenOriginal(file.id)
                                  .catch((error) =>
                                    toast.error(describe(error)),
                                  )
                              }
                            >
                              <ExternalLink />
                              打开原件
                            </Button>
                          </div>
                        </div>
                      ))}
                      {!files.length && (
                        <div className="p-8 text-center text-sm text-[var(--app-text-muted)]">
                          还没有文件，点击“批量添加资料”一次加入多份文件。
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-52 flex-col items-center justify-center text-center">
                    <FolderOpen className="mb-3 size-10 text-[var(--app-text-muted)]" />
                    <h2 className="text-lg font-semibold">选择一个资料集</h2>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--app-text-muted)]">
                      从左侧查看已有资料，或新建主题批量导入文件。
                    </p>
                  </div>
                )}
                <section className="mt-8 rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Search className="size-4" />
                    搜索原文
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-muted)]">
                    搜索当前类型的完整资料：
                    {kind === "skill" ? "已启用的 Skill" : "资料文档"}
                    {tagFilter.untagged
                      ? " / 未打标签"
                      : tagFilter.tags.length
                        ? ` / ${tagFilter.match === "all" ? "同时包含" : "任一标签"}：${tagFilter.tags.join("、")}`
                        : ""}
                    。
                  </p>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void runSearch();
                    }}
                  >
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="检索知识原文"
                      placeholder="输入公司、岗位或知识关键词…"
                    />
                    <Button variant="outline" disabled={searching}>
                      {searching ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Search />
                      )}
                      检索
                    </Button>
                  </form>
                  {searchError && (
                    <p role="alert" className="mt-3 text-sm text-red-700">
                      {searchError}
                    </p>
                  )}
                  {hits && (
                    <div className="mt-4 space-y-2">
                      {hits.length ? (
                        hits.map((hit, i) => (
                          <button
                            key={`${hit.assetId}-${hit.offset}-${i}`}
                            data-library-hit
                            aria-label={`${hit.collection} / ${hit.filename}：阅读来源原文`}
                            className="w-full cursor-pointer rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-left"
                            onClick={() =>
                              void openFile(hit.assetId, hit.offset)
                            }
                          >
                            <p className="text-xs font-semibold">
                              {hit.collection} / {hit.filename}
                            </p>
                            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-[var(--app-text-muted)]">
                              {hit.excerpt}
                            </p>
                            <span className="mt-2 inline-block text-xs text-[var(--app-accent)]">
                              阅读来源原文 →
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--app-text-muted)]">
                          没有找到相关原文，请尝试其他关键词。
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </main>
            </div>
          )}
        </>
      )}
      {draft && (
        <KnowledgeDraftDialog
          key={draft.id}
          draft={draft}
          onClose={() => {
            setDraft(null);
            setRevision((r) => r + 1);
          }}
          onApplied={() => {
            void refresh();
            setRevision((r) => r + 1);
            void useKnowledgeStore.getState().load();
          }}
          onNext={setDraft}
        />
      )}
      {audio && (
        <AudioWorkbench
          asset={audio}
          onClose={() => setAudio(null)}
          onChanged={() => void refresh()}
          onDraft={(value) => {
            setAudio(null);
            setDraft(value);
            setRevision((r) => r + 1);
          }}
        />
      )}
      {batch && (
        <BatchImport
          kind={batch.kind}
          existing={batch.collection}
          categories={categories}
          onCompile={(id) => {
            setBatch(null);
            void runKnowledge("正在整理新资料", () =>
              api.knowledgeCompilePrepare(id),
            );
          }}
          onClose={() => setBatch(null)}
          onDone={async (id) => {
            await refresh();
            setSelected(id);
          }}
        />
      )}
      {editing && (
        <CollectionEditor
          collection={editing}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}
      <Dialog
        open={!!reader}
        onOpenChange={(open) => {
          if (!open) setReader(null);
        }}
      >
        <DialogContent className="flex h-[min(720px,calc(100dvh-32px))] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-words pr-7">
              {reader?.filename}
            </DialogTitle>
            <DialogDescription>
              完整解析原文 · {reader?.total.toLocaleString()} 字 · 当前{" "}
              {reader ? reader.offset + 1 : 0}–
              {reader ? reader.offset + [...reader.content].length : 0}
            </DialogDescription>
          </DialogHeader>
          <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4 font-sans text-sm leading-relaxed">
            {reader?.content}
          </pre>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!reader || reader.offset === 0 || reading}
              onClick={() =>
                reader &&
                void openFile(reader.assetId, Math.max(0, reader.offset - 6000))
              }
            >
              上一页
            </Button>
            <Button
              disabled={reader?.nextOffset == null || reading}
              onClick={() =>
                reader?.nextOffset != null &&
                void openFile(reader.assetId, reader.nextOffset)
              }
            >
              {reading && <Loader2 className="animate-spin" />}下一页
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CollectionEditor({
  collection,
  onClose,
  onDone,
}: {
  collection: api.LibraryCollection;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [title, setTitle] = useState(collection.title),
    [purpose, setPurpose] = useState(collection.purpose),
    [tags, setTags] = useState(collectionTags(collection)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑资料集</DialogTitle>
          <DialogDescription>
            标签和用途会提供给 AI，帮助它选择相关资料。
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm">
          名称
          <Input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="space-y-2 text-sm">
          <label>标签</label>
          <TagInput value={tags} onChange={setTags} />
          <p className="text-[11px] text-muted-foreground">
            同一资料集可有多个标签，例如：前端、星河科技、面试。
          </p>
        </div>
        <label className="space-y-2 text-sm">
          用途
          <Textarea
            value={purpose}
            maxLength={2000}
            rows={4}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
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
              try {
                await api.libraryPutCollection({
                  ...collection,
                  title,
                  purpose,
                  tags,
                  category: tags[0] || "",
                });
                await onDone();
                onClose();
              } catch (error) {
                setError(describe(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Queued = {
  key: string;
  file: File | api.LibraryPickedFile;
  status: "queued" | "importing" | "ready" | "error";
  error?: string;
};
function BatchImport({
  kind,
  existing,
  categories,
  onClose,
  onDone,
  onCompile,
}: {
  kind: Kind;
  existing?: api.LibraryCollection;
  categories: string[];
  onClose: () => void;
  onDone: (id: string) => Promise<void>;
  onCompile?: (id: string) => void;
}) {
  const [title, setTitle] = useState(existing?.title || ""),
    [purpose, setPurpose] = useState(existing?.purpose || ""),
    [tags, setTags] = useState<string[]>(
      existing ? collectionTags(existing) : [],
    );
  const [queue, setQueue] = useState<Queued[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [collectionId, setCollectionId] = useState(existing?.id || "");
  const aiConfigured = useSettingsStore((s) =>
    Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()),
  );
  const [autoWiki, setAutoWiki] = useState(aiConfigured && kind === "document");
  const input = useRef<HTMLInputElement>(null);
  const pickedTokens = useRef<string[]>([]);
  useEffect(
    () => () => {
      if (pickedTokens.current.length)
        void api
          .libraryReleasePicks(pickedTokens.current)
          .catch(() => undefined);
    },
    [],
  );
  const choose = async () => {
    try {
      const selected = isTauri() ? await api.libraryChooseFiles(kind) : null;
      if (selected === null) {
        input.current?.click();
        return;
      }
      pickedTokens.current.push(...selected.map((file) => file.token));
      add(selected);
    } catch (cause) {
      setError(describe(cause));
    }
  };
  const add = (files: FileList | (File | api.LibraryPickedFile)[]) => {
    const added = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      status: "queued" as const,
    }));
    if (!title.trim() && added[0])
      setTitle(added[0].file.name.replace(/\.[^.]+$/, "").slice(0, 120));
    setQueue((current) => [
      ...current,
      ...added.filter(
        (item) =>
          !current.some(
            (old) =>
              old.file.name === item.file.name &&
              old.file.size === item.file.size &&
              old.file.lastModified === item.file.lastModified,
          ),
      ),
    ]);
  };
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const id =
        collectionId ||
        (await api.libraryPutCollection({
          title,
          purpose,
          tags,
          category: tags[0] || "",
          kind,
          enabled: true,
        }));
      setCollectionId(id);
      let allSuccess = true;
      let canCompile = queue.some(
        (item) => item.status === "ready" && !api.isAudioAsset(item.file.name),
      );
      for (const item of queue.filter((item) => item.status !== "ready")) {
        setQueue((value) =>
          value.map((row) =>
            row.key === item.key
              ? { ...row, status: "importing", error: undefined }
              : row,
          ),
        );
        try {
          if (
            item.file.size >
            (api.isAudioAsset(item.file.name) ? 250 : 30) * 1024 * 1024
          )
            throw new Error("文档最大30 MB，录音最大250 MB");
          const result =
            "token" in item.file
              ? await api.libraryImportPickedFile(id, item.file.token)
              : await api.libraryImportFile(
                  id,
                  item.file.name,
                  Array.from(new Uint8Array(await item.file.arrayBuffer())),
                );
          const imported = [
            "ready",
            "needs_transcription",
            "needs_distillation",
          ].includes(result.status);
          if (!imported) allSuccess = false;
          if (result.status === "ready") canCompile = true;
          setQueue((value) =>
            value.map((row) =>
              row.key === item.key
                ? {
                    ...row,
                    status: imported ? "ready" : "error",
                    error: result.error,
                  }
                : row,
            ),
          );
        } catch (error) {
          allSuccess = false;
          setQueue((value) =>
            value.map((row) =>
              row.key === item.key
                ? { ...row, status: "error", error: describe(error) }
                : row,
            ),
          );
        }
      }
      await onDone(id);
      if (allSuccess && canCompile && autoWiki && kind === "document")
        onCompile?.(id);
    } catch (error) {
      setError(describe(error));
    } finally {
      setBusy(false);
    }
  };
  const complete =
    queue.length > 0 && queue.every((item) => item.status === "ready");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-32px)] flex-col sm:max-w-2xl"
        data-library-import
      >
        <DialogHeader>
          <DialogTitle>
            {existing
              ? `添加到「${existing.title}」`
              : kind === "skill"
                ? "上传 Skill 技能"
                : "新建资料集 · 批量导入"}
          </DialogTitle>
          <DialogDescription>
            {kind === "skill"
              ? "上传 SKILL.md 或含引用资料的 ZIP 包。独立存放，可随时停用。"
              : "同一主题的不同格式，一次选中、一起导入。无需反复上传。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept={
              kind === "skill"
                ? ".md,.zip"
                : ".pdf,.docx,.csv,.xlsx,.md,.txt,.mp3,.m4a,.wav,.mp4,.webm,.ogg,.flac"
            }
            className="sr-only"
            aria-label="选择批量上传文件"
            onChange={(e) => {
              if (e.target.files) add(e.target.files);
              e.target.value = "";
            }}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-[var(--app-accent)] bg-[var(--app-accent-soft)]/30 px-4 py-6 text-center disabled:opacity-50"
            onClick={() => void choose()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) add(e.dataTransfer.files);
            }}
          >
            <Upload className="size-6" />
            <span className="text-sm font-medium">
              {isTauri() ? "点击选择多个文件" : "点击选择多个文件，或拖入这里"}
            </span>
            <span className="text-xs text-[var(--app-text-muted)]">
              {kind === "skill"
                ? "SKILL.md / ZIP 技能包"
                : "PDF / DOCX / CSV / XLSX / MD / TXT · MP3 / M4A / WAV / MP4 / WEBM / OGG / FLAC"}{" "}
              · 文档最大30 MB，录音最大250 MB
            </span>
          </button>
          {!existing && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  资料集名称
                  <Input
                    aria-label="资料集名称"
                    value={title}
                    disabled={!!collectionId}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      kind === "skill"
                        ? "例如：行为面试教练"
                        : "例如：星河科技面试"
                    }
                  />
                </label>
                <details className="sm:col-span-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    标签与用途（可选，稍后也能补充）
                  </summary>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <label>标签</label>
                    <TagInput
                      value={tags}
                      onChange={setTags}
                      suggestions={categories}
                      disabled={!!collectionId}
                    />
                  </div>
                  <label className="mt-3 block space-y-1.5 text-sm">
                    用途
                    <Textarea
                      aria-label="资料集用途"
                      value={purpose}
                      disabled={!!collectionId}
                      maxLength={2000}
                      onChange={(e) => setPurpose(e.target.value)}
                      rows={2}
                      placeholder="例如：用于准备前端二面，重点关注项目追问与团队协作"
                    />
                  </label>
                </details>
              </div>
            </>
          )}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-[var(--app-text-muted)]">
                {queue.filter((item) => item.status === "ready").length} /{" "}
                {queue.length} 个文件已就绪
              </div>
              {queue.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start gap-2 rounded-lg border border-[var(--app-border)] p-3"
                >
                  {item.status === "importing" ? (
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                  ) : item.status === "ready" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--app-accent)]" />
                  ) : item.status === "error" ? (
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  ) : (
                    <FileText className="mt-0.5 size-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm">{item.file.name}</p>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      {item.status === "queued"
                        ? `${Math.ceil(item.file.size / 1024)} KB · 等待导入`
                        : item.status === "importing"
                          ? "正在解析与建立索引…"
                          : item.status === "ready"
                            ? api.isAudioAsset(item.file.name)
                              ? "原件已保留，下一步转写与提炼"
                              : "已导入，可检索完整原文"
                            : item.error}
                    </p>
                  </div>
                  {!busy && item.status !== "ready" && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`移除 ${item.file.name}`}
                      onClick={() =>
                        setQueue((value) =>
                          value.filter((row) => row.key !== item.key),
                        )
                      }
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!existing && (
            <WorkspaceAssistant
              scope="upload"
              title="描述资料的主题和用途"
              placeholder="例如：这些都是星河科技前端面经，打上公司、前端、面试等标签，重点支持二面准备…"
              context={() => ({
                title,
                purpose,
                tags,
                availableTags: categories,
                files: queue.map((item) => ({
                  name: item.file.name,
                  size: item.file.size,
                })),
              })}
              onApply={async (actions, base) => {
                const old = base as {
                  title: string;
                  purpose: string;
                  tags: string[];
                };
                assertUnchanged(
                  { title: old.title, purpose: old.purpose, tags: old.tags },
                  { title, purpose, tags },
                );
                for (const action of actions) {
                  validateWorkspaceFields(action);
                  if (action.kind !== "collection")
                    throw Error("不是资料集命名/归类建议");
                  if (action.fields.title !== undefined)
                    setTitle(String(action.fields.title));
                  if (action.fields.purpose !== undefined)
                    setPurpose(String(action.fields.purpose));
                  if (Array.isArray(action.fields.tags))
                    setTags(normalizeTags(action.fields.tags));
                  else if (action.fields.category !== undefined)
                    setTags(normalizeTags([String(action.fields.category)]));
                }
              }}
            />
          )}
          {kind === "document" && aiConfigured && (
            <label className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-xs">
              <span>
                导入后生成 Wiki 更新建议
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  会用已配置的AI逐段阅读文档；录音需先完成转写与提炼。
                </span>
              </span>
              <Switch
                aria-label="导入后整理Wiki"
                checked={autoWiki}
                onCheckedChange={setAutoWiki}
                disabled={busy}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-2 items-center">
          <span className="mr-auto text-xs text-[var(--app-text-muted)]">
            导入会保留原件，成功的文件不会重复导入。
          </span>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {collectionId ? "完成" : "取消"}
          </Button>
          {!complete && (
            <Button
              variant="primary"
              disabled={
                busy || !queue.length || (!collectionId && !title.trim())
              }
              onClick={() => void run()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Archive />}
              {busy
                ? "正在导入"
                : queue.some((item) => item.status === "error")
                  ? "重试未完成文件"
                  : `导入${autoWiki && kind === "document" ? "并整理" : ""} ${queue.length} 个文件`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
