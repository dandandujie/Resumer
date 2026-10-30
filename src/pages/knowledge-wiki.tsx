import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronRight,
  FilePlus,
  FileText,
  FolderOpen,
  Hash,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  Network,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceAssistant } from "@/components/ai/workspace-assistant";
import { KnowledgeProposalCard } from "@/components/ai/ai-proposal-card";
import { KnowledgeDraftDialog } from "@/components/knowledge/draft-dialog";
import { WikiExplorer } from "@/components/knowledge/wiki-explorer";
import { WikiCreateDialog } from "@/components/knowledge/wiki-create-dialog";
import {
  WikiConflictDialog,
  type WikiConflict,
} from "@/components/knowledge/wiki-conflict-dialog";
import { WikiPropertiesDialog } from "@/components/knowledge/wiki-properties-dialog";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import {
  useKnowledgeStore,
  type PendingEntity,
} from "@/stores/knowledge-store";
import { useWikiWorkspace } from "@/stores/wiki-workspace-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUIStore } from "@/stores/ui-store";
import { NO_PROPOSALS, useJournalStore } from "@/stores/journal-store";
import { useResume } from "@/hooks/use-resume";
import { mergeKnowledgeGraph } from "@/lib/knowledge-graph";
import {
  PURPOSE_HEADINGS,
  WIKILINK_SCHEME,
  parsePurpose,
  serializePurpose,
  stripFrontmatter,
  wikilinksToMarkdown,
  type PurposeFields,
} from "@/lib/knowledge-page";
import {
  wikiBreadcrumb,
  wikiHeadings,
  resolveWikiFile,
  formatWikiTimestamp,
  resolveWikiTarget,
  wikiExtraProperties,
  reorderWikiTabs,
} from "@/lib/wiki-workspace";
import * as api from "@/lib/tauri-api";
import "@/styles/wiki.css";
const GRAPH = "@graph";
const errorMessage = (e: unknown) => String((e as Error)?.message || e);
const TYPE_NAMES: Record<string, string> = {
  root: "工作区说明",
  company: "公司",
  role: "岗位",
  concept: "概念",
  experience: "经验",
  guide: "准备指南",
  question: "综合问答",
  source: "来源",
  skill: "岗位画像",
  sop: "工作流程",
  market: "市场",
  note: "笔记",
};
export default function KnowledgeWiki({
  onAddSource,
  onChange,
}: {
  onAddSource?: () => void;
  onChange?: () => void;
}) {
  const t = useTranslations("knowledge"),
    router = useRouter();
  const {
    pages,
    selectedPath,
    selectedContent,
    pendingEntities,
    loading,
    load,
    reindex,
    select,
    write,
    adoptEntity,
    dismissEntity,
    drafts,
    setDraft,
    clearSavedDraft,
  } = useKnowledgeStore();
  const workspace = useWikiWorkspace();
  const [conflict, setConflict] = useState<WikiConflict | null>(null);
  const [folders, setFolders] = useState<string[]>([]),
    [folder, setFolder] = useState("wiki/guides");
  const [explorerMode, setExplorerMode] = useState<
      "files" | "search" | "bookmarks"
    >("files"),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<api.KnowledgeSearchHit[]>([]),
    [searching, setSearching] = useState(false);
  const [quick, setQuick] = useState(false),
    [quickQuery, setQuickQuery] = useState(""),
    [quickIndex, setQuickIndex] = useState(0);
  const [create, setCreate] = useState<"note" | "folder" | null>(null),
    [properties, setProperties] = useState(false),
    [mobileExplorer, setMobileExplorer] = useState(false),
    [savingPath, setSavingPath] = useState<string | null>(null);
  const [knowledgeDraft, setKnowledgeDraft] =
      useState<api.KnowledgeDraft | null>(null),
    [maintaining, setMaintaining] = useState(false),
    [lintIssues, setLintIssues] = useState<string[] | null>(null);
  const [graph, setGraph] = useState<api.KnowledgeGraphData>({
    nodes: [],
    edges: [],
  });
  const [resultQuery, setResultQuery] = useState("");
  const [mentions, setMentions] = useState<api.KnowledgeSearchHit[]>([]);
  const scroll = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    positions = useRef(new Map<string, number>()),
    dragTab = useRef<string | null>(null);
  const active = workspace.active,
    graphActive = active === GRAPH;
  const selected = pages.find((p) => p.path === active);
  const ready = active === selectedPath,
    editing = !!active && workspace.editingPaths.includes(active),
    saving = !!savingPath;
  const currentDraft = active ? drafts[active] : undefined;
  const draftContent =
    typeof currentDraft === "object"
      ? serializePurpose(currentDraft)
      : (currentDraft ?? selectedContent);
  const isPurpose = active === "purpose.md",
    purpose =
      typeof currentDraft === "object"
        ? currentDraft
        : parsePurpose(draftContent);
  const dirty = currentDraft !== undefined && draftContent !== selectedContent;
  const configured = useSettingsStore(
    (s) => !!(s.aiApiKey.trim() && s.aiBaseURL.trim()),
  );
  const applications = useJournalStore((s) => s.applications),
    mocks = useJournalStore((s) => s.mocks),
    hydrateJournal = useJournalStore((s) => s.hydrate);
  const proposals = useJournalStore(
      (s) => s.knowledgeProposals.__global__ ?? NO_PROPOSALS,
    ),
    resolveProposal = useJournalStore((s) => s.resolveKnowledgeProposal);
  const { resumes, fetchResumes } = useResume();
  const refreshGraph = useCallback(
    () =>
      api
        .knowledgeGraph()
        .then(setGraph)
        .catch((e) => toast.error(errorMessage(e))),
    [],
  );
  const refreshFolders = useCallback(
    () =>
      api
        .knowledgeFolders()
        .then(setFolders)
        .catch((e) => toast.error(errorMessage(e))),
    [],
  );
  const openPage = useCallback(async (path: string) => {
    if (useWikiWorkspace.getState().active !== path)
      useWikiWorkspace.getState().open(path);
    setMobileExplorer(false);
    if (path !== GRAPH)
      try {
        await useKnowledgeStore.getState().select(path);
      } catch (e) {
        toast.error(errorMessage(e));
      }
  }, []);
  const setEditing = useCallback((value: boolean) => {
    const s = useWikiWorkspace.getState();
    if (!s.active || s.active === GRAPH) return;
    useWikiWorkspace.setState({
      editingPaths: value
        ? [...new Set([...s.editingPaths, s.active])]
        : s.editingPaths.filter((p) => p !== s.active),
    });
  }, []);
  useEffect(() => {
    let live = true;
    const pending = useKnowledgeStore.getState().pendingOpen;
    void load()
      .then(async () => {
        if (!live) return;
        const p = useKnowledgeStore.getState().pages,
          ws = useWikiWorkspace.getState(),
          valid = (path: string) =>
            path === GRAPH || p.some((p) => p.path === path);
        useWikiWorkspace.setState({
          tabs: ws.tabs.filter(valid),
          initialized: true,
        });
        const target =
          !pending && ws.initialized && ws.active === null
            ? null
            : pending && valid(pending.path)
              ? pending.path
              : ws.active && valid(ws.active)
                ? ws.active
                : useKnowledgeStore.getState().selectedPath;
        if (target && valid(target)) {
          await openPage(target);
          if (pending?.edit) setEditing(true);
        } else useWikiWorkspace.setState({ active: null });
        useKnowledgeStore.setState({ pendingOpen: null });
      })
      .catch((e) => toast.error(errorMessage(e)));
    void refreshFolders();
    void refreshGraph();
    void hydrateJournal();
    void fetchResumes();
    return () => {
      live = false;
    };
  }, [
    load,
    openPage,
    setEditing,
    refreshFolders,
    refreshGraph,
    hydrateJournal,
    fetchResumes,
  ]);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (explorerMode !== "search" || !query.trim() || query.startsWith("#")) {
        setHits([]);
        setResultQuery(query.trim());
        setSearching(false);
        return;
      }
      setSearching(true);
      api
        .knowledgeSearch(query.trim(), undefined, 40, false)
        .then((rows) => {
          if (!cancelled) {
            setHits(rows);
            setResultQuery(query.trim());
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setResultQuery(query.trim());
            toast.error(errorMessage(e));
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, explorerMode]);
  const inbound = useMemo(
    () =>
      graph.edges
        .filter((e) => e.target === active && e.source !== active)
        .map((e) => e.source)
        .filter((p, i, a) => a.indexOf(p) === i),
    [graph, active],
  );
  const outgoing = useMemo(
    () =>
      graph.edges
        .filter((e) => e.source === active && e.target !== active)
        .map((e) => e.target)
        .filter((p, i, a) => a.indexOf(p) === i),
    [graph, active],
  );
  useEffect(() => {
    let cancelled = false;
    if (workspace.sidePanel === "backlinks" && selected?.title) {
      void api
        .knowledgeSearch(selected.title, undefined, 30, false)
        .then((rows) => {
          if (!cancelled)
            setMentions(
              rows.filter(
                (p) => p.path !== active && !inbound.includes(p.path),
              ),
            );
        })
        .catch(() => {
          if (!cancelled) setMentions([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [workspace.sidePanel, selected?.title, active, inbound]);
  const body = useMemo(() => {
    let text = stripFrontmatter(selectedContent);
    const heading = text.match(/^\s*# ([^\n]+)\n/);
    if (heading && heading[1].trim() === selected?.title)
      text = text.slice(heading[0].length);
    return text;
  }, [selectedContent, selected?.title]);
  const markdown = useMemo(() => wikilinksToMarkdown(body), [body]),
    outline = useMemo(() => wikiHeadings(body), [body]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scroll.current)
        scroll.current.scrollTop = positions.current.get(active || "") || 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [active, selectedContent]);
  const save = useCallback(async () => {
    const path = useWikiWorkspace.getState().active;
    if (
      !path ||
      path === GRAPH ||
      savingPath ||
      useKnowledgeStore.getState().selectedPath !== path
    )
      return;
    const state = useKnowledgeStore.getState(),
      draft = state.drafts[path],
      text =
        typeof draft === "object"
          ? serializePurpose(draft)
          : (draft ?? state.selectedContent);
    setSavingPath(path);
    try {
      await write(path, text);
      clearSavedDraft(path, draft);
      if (
        useWikiWorkspace.getState().active === path &&
        useKnowledgeStore.getState().drafts[path] === undefined
      )
        setEditing(false);
      toast.success(t("saved"));
      void refreshGraph();
      onChange?.();
    } catch (e) {
      if (errorMessage(e).includes("其他编辑器")) {
        try {
          setConflict({
            path,
            text,
            onDisk: await api.knowledgeRead(path),
            draft,
          });
        } catch (readError) {
          toast.error(errorMessage(readError));
        }
      } else toast.error(errorMessage(e));
    } finally {
      setSavingPath(null);
    }
  }, [
    savingPath,
    write,
    clearSavedDraft,
    setEditing,
    t,
    refreshGraph,
    onChange,
  ]);
  const closeTab = useCallback(
    (path: string) => {
      const next = useWikiWorkspace.getState().close(path);
      if (next && next !== GRAPH)
        void select(next).catch((e) => toast.error(errorMessage(e)));
      if (drafts[path] !== undefined)
        toast("标签页已关闭，未保存草稿仍保留在本机。");
    },
    [select, drafts],
  );
  const travel = useCallback(
    (offset: number) => {
      const target = useWikiWorkspace.getState().travel(offset);
      if (target && target !== GRAPH)
        void select(target).catch((e) => toast.error(errorMessage(e)));
    },
    [select],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (quick || create || properties || conflict) return;
      if (modifier && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setQuick(true);
      } else if (modifier && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (modifier && e.key.toLowerCase() === "e" && active !== GRAPH) {
        e.preventDefault();
        setEditing(!editing);
      } else if (modifier && e.key.toLowerCase() === "w" && active) {
        e.preventDefault();
        closeTab(active);
      } else if (e.ctrlKey && e.key === "Tab" && workspace.tabs.length) {
        e.preventDefault();
        const index = workspace.tabs.indexOf(active || "");
        void openPage(
          workspace.tabs[
            (index + (e.shiftKey ? -1 : 1) + workspace.tabs.length) %
              workspace.tabs.length
          ],
        );
      } else if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        travel(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    quick,
    create,
    properties,
    conflict,
    save,
    active,
    editing,
    setEditing,
    closeTab,
    workspace.tabs,
    openPage,
    travel,
  ]);
  const reindexAll = async () => {
    try {
      const n = await reindex();
      await refreshFolders();
      await refreshGraph();
      toast.success(t("reindexDone", { count: n }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const maintain = async () => {
    if (!configured) {
      useUIStore.getState().setSettingsTab("ai");
      useUIStore.getState().openModal("settings");
      return;
    }
    setMaintaining(true);
    try {
      setKnowledgeDraft(await api.knowledgeMaintainPrepare());
      onChange?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setMaintaining(false);
    }
  };
  const lint = async () => {
    try {
      const result = await api.knowledgeLint();
      setLintIssues(result.issues);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const adopt = async (entity: PendingEntity) => {
    try {
      const path = await adoptEntity(entity);
      await openPage(path);
      void refreshGraph();
      onChange?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const toggleExplorer = () => {
    if (window.innerWidth < 900) {
      setMobileExplorer((v) => !v);
      useWikiWorkspace.setState({ explorer: true });
    } else useWikiWorkspace.setState({ explorer: !workspace.explorer });
  };
  const side = (panel: "outline" | "backlinks" | "ai") =>
    useWikiWorkspace.setState({
      sidePanel: workspace.sidePanel === panel ? null : panel,
    });
  const selectFolder = (path: string) => {
    setFolder(path);
    useWikiWorkspace.setState({
      collapsed: workspace.collapsed.filter((p) => !path.startsWith(p)),
    });
  };
  const resize = (e: React.PointerEvent) => {
    const start = e.clientX,
      width = workspace.width;
    const move = (event: PointerEvent) =>
      useWikiWorkspace.setState({
        width: Math.max(205, Math.min(360, width + event.clientX - start)),
      });
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    e.preventDefault();
  };
  const quickRows = pages
    .filter((p) =>
      `${p.title} ${p.path}`
        .toLocaleLowerCase()
        .includes(quickQuery.toLocaleLowerCase()),
    )
    .slice(0, 30);
  const mergedGraph = useMemo(
    () =>
      mergeKnowledgeGraph(graph, applications, mocks, resumes, {
        application: "未命名投递",
        interview: "面试",
        mockInterview: "模拟面试",
      }),
    [graph, applications, mocks, resumes],
  );
  const allTags = [...new Set(pages.flatMap((p) => p.tags))];
  const link = (target: string) => {
    const path = resolveWikiTarget(pages, active || "", target);
    if (path) void openPage(path);
    else {
      const needle = target.replace(/\.md$/, "");
      const matches = pages.filter(
        (p) => p.title === needle || p.path.split("/").pop() === target,
      );
      if (matches.length > 1) {
        setQuickQuery(needle);
        setQuick(true);
        toast("有多篇同名笔记，请选择要打开的页面。");
      } else toast.error(`未找到笔记：${target}`);
    }
  };
  const jump = (index: number) => {
    if (editing) setEditing(false);
    requestAnimationFrame(() =>
      document
        .getElementById(`wiki-heading-${index}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };
  const renderLinks = (paths: string[], empty: string) =>
    paths.length ? (
      <div className="space-y-1">
        {paths.map((path) => (
          <button
            type="button"
            key={path}
            className="wiki-related-row"
            onClick={() => link(path)}
            title={path}
          >
            <FileText className="size-3 shrink-0" />
            <span className="truncate">
              {pages.find((p) => p.path === path)?.title || path}
            </span>
          </button>
        ))}
      </div>
    ) : (
      <p className="text-[11px] leading-6 text-muted-foreground">{empty}</p>
    );
  let headingIndex = 0;
  return (
    <section
      className="wiki-frame"
      data-wiki-workspace
      data-nav={workspace.explorer ? "open" : "closed"}
      data-side={workspace.sidePanel ? "open" : "closed"}
      style={{ "--wiki-nav-width": `${workspace.width}px` } as CSSProperties}
    >
      <div className="wiki-explorer-wrap" data-mobile-open={mobileExplorer}>
        <WikiExplorer
          pages={pages}
          folders={folders}
          selected={active}
          drafts={drafts}
          mode={explorerMode}
          setMode={setExplorerMode}
          query={query}
          setQuery={setQuery}
          hits={hits}
          searching={
            searching ||
            (explorerMode === "search" &&
              !!query.trim() &&
              !query.startsWith("#") &&
              resultQuery !== query.trim())
          }
          onOpen={(path) => void openPage(path)}
          onFolder={setFolder}
          onNew={() => setCreate("note")}
          onNewFolder={() => setCreate("folder")}
        />
        <div
          className="wiki-resizer"
          role="separator"
          aria-label="调整Wiki目录宽度"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={resize}
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              useWikiWorkspace.setState({
                width: Math.max(
                  205,
                  Math.min(
                    360,
                    workspace.width + (e.key === "ArrowRight" ? 10 : -10),
                  ),
                ),
              });
            }
          }}
        />
      </div>
      {mobileExplorer && (
        <button
          type="button"
          className="wiki-nav-backdrop"
          aria-label="关闭Wiki目录"
          onClick={() => setMobileExplorer(false)}
        />
      )}
      <div className="wiki-document">
        <div className="wiki-tabs-strip">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="切换Wiki文件目录"
            title="文件目录"
            onClick={toggleExplorer}
          >
            <PanelLeft />
          </Button>
          <div
            className="wiki-tabs"
            role="tablist"
            aria-label="打开的Wiki笔记"
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const i = workspace.tabs.indexOf(active || "");
                if (
                  e.altKey &&
                  e.shiftKey &&
                  ["ArrowLeft", "ArrowRight"].includes(e.key)
                ) {
                  const target =
                    workspace.tabs[i + (e.key === "ArrowRight" ? 1 : -1)];
                  if (target && active)
                    workspace.setTabs(
                      reorderWikiTabs(workspace.tabs, active, target),
                    );
                  return;
                }
                const n =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? workspace.tabs.length - 1
                      : (i +
                          (e.key === "ArrowRight" ? 1 : -1) +
                          workspace.tabs.length) %
                        workspace.tabs.length;
                const path = workspace.tabs[n];
                if (path) {
                  void openPage(path);
                  const buttons =
                    e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "[role=tab]",
                    );
                  buttons[n]?.focus();
                }
              }
            }}
          >
            {workspace.tabs.map((path) => (
              <div
                className="wiki-tab"
                data-active={path === active}
                key={path}
                draggable
                onDragStart={(event) => {
                  dragTab.current = path;
                  event.dataTransfer.setData("text/plain", path);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  dragTab.current = null;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragTab.current;
                  if (from && from !== path) {
                    workspace.setTabs(
                      reorderWikiTabs(workspace.tabs, from, path),
                    );
                  }
                  dragTab.current = null;
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active === path}
                  tabIndex={active === path ? 0 : -1}
                  data-wiki-tab={path}
                  onClick={() => void openPage(path)}
                  title={path === GRAPH ? "知识图谱" : path}
                >
                  {path === GRAPH ? (
                    <Network className="size-3 shrink-0" />
                  ) : (
                    <FileText className="size-3 shrink-0 opacity-60" />
                  )}
                  <span className="truncate">
                    {path === GRAPH
                      ? "知识图谱"
                      : pages.find((p) => p.path === path)?.title ||
                        path.split("/").pop()}
                  </span>
                  {drafts[path] !== undefined && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-[var(--app-accent)]"
                      aria-label="有未保存草稿"
                    />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`关闭笔记 ${path === GRAPH ? "知识图谱" : pages.find((p) => p.path === path)?.title || path}`}
                  className="wiki-tab-close"
                  onClick={() => closeTab(path)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            title="快速打开笔记 · ⌘O / Ctrl+O"
            aria-label="快速打开Wiki笔记"
            onClick={() => setQuick(true)}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="打开知识图谱"
            title="知识图谱"
            onClick={() => void openPage(GRAPH)}
          >
            <Network />
          </Button>
        </div>
        <div className="wiki-note-toolbar">
          <div className="flex shrink-0 gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              title="后退 · Alt+←"
              aria-label="Wiki后退"
              disabled={workspace.at <= 0}
              onClick={() => travel(-1)}
            >
              <ArrowLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="前进 · Alt+→"
              aria-label="Wiki前进"
              disabled={workspace.at >= workspace.history.length - 1}
              onClick={() => travel(1)}
            >
              <ArrowRight />
            </Button>
          </div>
          <nav className="wiki-breadcrumb" aria-label="笔记路径" title={active||'求职 Wiki'}>
            {active && !graphActive ? (
              <>
                {wikiBreadcrumb(active).map((part) => (
                  <span key={part.path} className="contents">
                    <button
                      type="button"
                      onClick={() => {
                        selectFolder(part.path);
                        useWikiWorkspace.setState({ explorer: true });
                        if (window.innerWidth < 900) setMobileExplorer(true);
                      }}
                    >
                      {part.label}
                    </button>
                    <ChevronRight className="size-3 shrink-0 opacity-50" />
                  </span>
                ))}
                <span className="truncate" title={active}>
                  {selected?.title || active}
                </span>
              </>
            ) : (
              <span>{graphActive ? "知识图谱" : "求职 Wiki"}</span>
            )}
          </nav>
          <div className="wiki-note-actions">
            {selected && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={
                    workspace.bookmarks.includes(selected.path)
                      ? "取消收藏"
                      : "收藏笔记"
                  }
                  aria-label={
                    workspace.bookmarks.includes(selected.path)
                      ? "取消收藏笔记"
                      : "收藏笔记"
                  }
                  aria-pressed={workspace.bookmarks.includes(selected.path)}
                  onClick={() => workspace.bookmark(selected.path)}
                >
                  <Bookmark
                    className={
                      workspace.bookmarks.includes(selected.path)
                        ? "fill-current text-[var(--app-accent)]"
                        : ""
                    }
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!ready || saving}
                  onClick={() => setEditing(!editing)}
                  title="切换阅读 / 编辑 · ⌘E / Ctrl+E"
                >
                  {editing ? <BookOpen /> : <Pencil />}
                  {editing ? t("read") : t("edit")}
                </Button>
                {editing && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!ready || saving}
                    onClick={() => void save()}
                  >
                    {savingPath === active ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    {savingPath === active ? t("saving") : t("save")}
                  </Button>
                )}
              </>
            )}
            <Button
              variant={workspace.sidePanel === "ai" ? "selected" : "ghost"}
              size="sm"
              onClick={() => side("ai")}
              aria-pressed={workspace.sidePanel === "ai"}
            >
              <Sparkles />
              <span className="wiki-ai-label">AI 助手</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="大纲与反向链接"
              aria-label="切换Wiki信息侧栏"
              onClick={() => side("outline")}
            >
              <PanelRight />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Wiki更多操作"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setCreate("note")}>
                  <FilePlus />
                  新建笔记
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setQuick(true)}>
                  <Search />
                  快速打开笔记
                </DropdownMenuItem>
                {selected && (
                  <DropdownMenuItem
                    disabled={currentDraft !== undefined || !ready}
                    onSelect={() => setProperties(true)}
                  >
                    <Pencil />
                    编辑笔记属性
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void reindexAll()}>
                  <RefreshCw />
                  重新索引 / 读取外部修改
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={maintaining}
                  onSelect={() => void maintain()}
                >
                  <Sparkles />
                  {maintaining ? "正在检查" : "维护 Wiki"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void lint()}>
                  检查结构与链接
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void api
                      .knowledgeOpenVault()
                      .catch((e) => toast.error(errorMessage(e)))
                  }
                >
                  <FolderOpen />
                  打开 Wiki 文件夹
                </DropdownMenuItem>
                {onAddSource && (
                  <DropdownMenuItem onSelect={onAddSource}>
                    导入来源资料
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {graphActive ? (
          <div className="min-h-0 flex-1 p-3">
            <KnowledgeGraph
              nodes={mergedGraph.nodes}
              edges={mergedGraph.edges}
              onNodeClick={(node) => {
                if (
                  node.id.startsWith("application:") ||
                  node.id.startsWith("interview:")
                )
                  router.push("/insights");
                else link(node.id);
              }}
            />
          </div>
        ) : active && selected ? (
          <>
            <div
              className="wiki-note-scroll"
              ref={scroll}
              data-wiki-scroll
              onScroll={(e) => {
                if (active)
                  positions.current.set(active, e.currentTarget.scrollTop);
              }}
            >
              <main className="wiki-note-content" data-wiki-note>
                <div className="wiki-note-title">
                  <h1
                    onDoubleClick={() => {
                      if (currentDraft === undefined) setProperties(true);
                    }}
                  >
                    {selected.title}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={
                      currentDraft !== undefined
                        ? "先保存正文，再修改属性"
                        : "编辑标题与标签"
                    }
                    aria-label="编辑笔记属性"
                    disabled={currentDraft !== undefined || !ready}
                    onClick={() => setProperties(true)}
                  >
                    <Pencil />
                  </Button>
                </div>
                <details
                  className="wiki-properties"
                  data-wiki-properties
                  open={workspace.propertiesOpen}
                  onToggle={(e) => {
                    if (e.currentTarget.open !== workspace.propertiesOpen)
                      useWikiWorkspace.setState({
                        propertiesOpen: e.currentTarget.open,
                      });
                  }}
                >
                  <summary>
                    <ChevronRight className="size-3 transition-transform" />
                    <span>笔记属性</span>
                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                      {TYPE_NAMES[selected.type] || "笔记"}
                      {selected.tags.length
                        ? ` · ${selected.tags.length} 个标签`
                        : ""}
                    </span>
                  </summary>
                  <dl>
                    <div>
                      <dt>
                        <FileText />
                        类型
                      </dt>
                      <dd>{TYPE_NAMES[selected.type] || selected.type}</dd>
                    </div>
                    <div>
                      <dt>
                        <Hash />
                        标签
                      </dt>
                      <dd className="flex flex-wrap gap-1">
                        {selected.tags.length ? (
                          selected.tags.map((tag) => (
                            <button
                              type="button"
                              key={tag}
                              className="wiki-property-tag"
                              onClick={() => {
                                setExplorerMode("search");
                                setQuery("#" + tag);
                                useWikiWorkspace.setState({ explorer: true });
                                if (window.innerWidth < 900)
                                  setMobileExplorer(true);
                              }}
                            >
                              #{tag}
                            </button>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            暂无标签
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>更新于</dt>
                      <dd>{formatWikiTimestamp(selected.updated)}</dd>
                    </div>
                    <div>
                      <dt>
                        <Link2 />
                        来源
                      </dt>
                      <dd className="space-y-1">
                        {selected.sources.length ? (
                          selected.sources.map((path) => (
                            <button
                              type="button"
                              key={path}
                              className="wiki-property-source"
                              title={path}
                              onClick={() => {
                                if (pages.some((p) => p.path === path))
                                  link(path);
                                else
                                  void api
                                    .knowledgeOpenFile(path)
                                    .catch((e) => toast.error(errorMessage(e)));
                              }}
                            >
                              {pages.find((p) => p.path === path)?.title ||
                                path.split("/").pop()}
                            </button>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            暂无直接来源
                          </span>
                        )}
                      </dd>
                    </div>
                    {wikiExtraProperties(selectedContent).map((property) => (
                      <div key={property.key}>
                        <dt>
                          {(
                            {
                              created: "创建于",
                              author: "作者",
                              published: "发布日期",
                              description: "描述",
                              source: "来源链接",
                            } as Record<string, string>
                          )[property.key] || property.key}
                        </dt>
                        <dd className="break-words">
                          {/^https?:\/\//.test(property.value) ? (
                            <a
                              className="wiki-inline-link"
                              href={property.value}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {property.value}
                            </a>
                          ) : ["created", "published"].includes(
                              property.key,
                            ) ? (
                            formatWikiTimestamp(property.value)
                          ) : (
                            property.value || "—"
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
                {dirty && (
                  <p className="wiki-draft-notice">
                    <span className="size-1.5 rounded-full bg-[var(--app-accent)]" />
                    {t("draftPending")}
                  </p>
                )}
                {!ready ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : editing ? (
                  isPurpose ? (
                    <div className="space-y-5" data-wiki-editor>
                      <p className="text-xs leading-6 text-muted-foreground">
                        {t("purposeHint")}
                      </p>
                      {(
                        Object.keys(PURPOSE_HEADINGS) as (keyof PurposeFields)[]
                      ).map((key) => (
                        <label
                          key={key}
                          className="block space-y-2 text-xs font-medium"
                        >
                          {t(`purpose${key[0].toUpperCase() + key.slice(1)}`)}
                          <Textarea
                            rows={
                              key === "constraints" || key === "other" ? 4 : 2
                            }
                            value={purpose[key]}
                            onChange={(e) => {
                              if (active)
                                setDraft(active, {
                                  ...purpose,
                                  [key]: e.target.value,
                                });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      ref={editor}
                      data-wiki-editor
                      aria-label={t("edit")}
                      spellCheck={false}
                      value={draftContent}
                      onChange={(e) => {
                        if (active) setDraft(active, e.target.value);
                      }}
                      className="wiki-source-editor"
                    />
                  )
                ) : (
                  <article className="ai-markdown wiki-prose">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(url) => {
                        if (url.startsWith(WIKILINK_SCHEME)) return url;
                        if (
                          active &&
                          (/^\.\.?\//.test(url) ||
                            /^(raw|materials|skills)\//.test(url))
                        ) {
                          const path = resolveWikiFile(active, url);
                          if (path) return "source:" + encodeURIComponent(path);
                        }
                        return defaultUrlTransform(url);
                      }}
                      components={{
                        h1: ({ children }) => (
                          <h1 id={`wiki-heading-${headingIndex++}`}>
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 id={`wiki-heading-${headingIndex++}`}>
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 id={`wiki-heading-${headingIndex++}`}>
                            {children}
                          </h3>
                        ),
                        a: ({ href, children }) =>
                          href?.startsWith(WIKILINK_SCHEME) ? (
                            <button
                              type="button"
                              className="wiki-inline-link"
                              onClick={() =>
                                link(
                                  decodeURI(href.slice(WIKILINK_SCHEME.length)),
                                )
                              }
                            >
                              {children}
                            </button>
                          ) : href?.startsWith("source:") ? (
                            <button
                              type="button"
                              className="wiki-inline-link"
                              onClick={() =>
                                void api
                                  .knowledgeOpenFile(
                                    decodeURIComponent(href.slice(7)),
                                  )
                                  .catch((e) => toast.error(errorMessage(e)))
                              }
                            >
                              {children}
                            </button>
                          ) : (
                            <a href={href} target="_blank" rel="noreferrer">
                              {children}
                            </a>
                          ),
                      }}
                    >
                      {markdown}
                    </ReactMarkdown>
                  </article>
                )}
              </main>
            </div>
            <footer className="wiki-note-status">
              <span className="min-w-0 truncate" title={active}>
                {active}
              </span>
              <span className="shrink-0">
                {dirty ? "草稿已在本机保留" : editing ? "编辑模式" : "阅读模式"}{" "}
                · {stripFrontmatter(draftContent).length} 字
              </span>
            </footer>
          </>
        ) : (
          <div className="wiki-welcome">
            <BookOpen className="size-8 stroke-1 text-muted-foreground" />
            <h2>从一篇笔记开始</h2>
            <p>在目录中打开笔记，或创建一篇自己的求职知识。</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreate("note")}
              >
                <FilePlus />
                新建笔记
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuick(true)}
              >
                <Search />
                打开笔记
              </Button>
            </div>
            <span className="text-[11px] text-muted-foreground">
              ⌘O / Ctrl+O 快速打开 · ⌘S / Ctrl+S 保存
            </span>
            {loading && <Loader2 className="size-4 animate-spin" />}
          </div>
        )}
      </div>
      {workspace.sidePanel && (
        <aside
          className="wiki-context-panel"
          data-wiki-panel={workspace.sidePanel}
        >
          <div
            className="wiki-context-tabs"
            role="tablist"
            aria-label="笔记辅助面板"
          >
            {(
              [
                { id: "outline", label: "大纲", Icon: List },
                { id: "backlinks", label: "链接", Icon: Link2 },
                { id: "ai", label: "AI", Icon: Sparkles },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                type="button"
                role="tab"
                aria-selected={workspace.sidePanel === id}
                key={id}
                onClick={() => side(id)}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="关闭Wiki辅助面板"
              onClick={() => useWikiWorkspace.setState({ sidePanel: null })}
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
            {workspace.sidePanel === "outline" ? (
              <>
                <section>
                  <h2 className="wiki-panel-heading">当前笔记大纲</h2>
                  {outline.length ? (
                    <nav className="space-y-0.5">
                      {outline.map((heading, i) => (
                        <button
                          type="button"
                          key={i}
                          className="wiki-outline-row"
                          style={{ paddingLeft: 8 + (heading.level - 1) * 10 }}
                          onClick={() => jump(i)}
                          title={heading.text}
                        >
                          {heading.text}
                        </button>
                      ))}
                    </nav>
                  ) : (
                    <p className="text-[11px] leading-6 text-muted-foreground">
                      笔记中的一级至三级标题会显示在这里。
                    </p>
                  )}
                </section>
                {selected && (
                  <section>
                    <h2 className="wiki-panel-heading">关联概览</h2>
                    <button
                      type="button"
                      className="wiki-related-row"
                      onClick={() => side("backlinks")}
                    >
                      <Link2 className="size-3" />
                      {inbound.length} 篇笔记链接到本页
                    </button>
                    <button
                      type="button"
                      className="wiki-related-row"
                      onClick={() => void openPage(GRAPH)}
                    >
                      <Network className="size-3" />
                      在知识图谱中查看
                    </button>
                  </section>
                )}
              </>
            ) : workspace.sidePanel === "backlinks" ? (
              <>
                <section>
                  <h2 className="wiki-panel-heading">
                    反向链接 <span>{inbound.length}</span>
                  </h2>
                  {renderLinks(
                    inbound,
                    "还没有其他笔记链接到本页。保存引用问答时会自动建立回链。",
                  )}
                </section>
                <section>
                  <h2 className="wiki-panel-heading">
                    本页链接 <span>{outgoing.length}</span>
                  </h2>
                  {renderLinks(
                    outgoing,
                    "本页尚未链接到其他笔记。可使用 [[笔记路径]] 建立关联。",
                  )}
                </section>
                <section>
                  <h2 className="wiki-panel-heading">
                    未链接提及 <span>{mentions.length}</span>
                  </h2>
                  {renderLinks(
                    mentions.map((p) => p.path),
                    "未发现包含当前标题的其他笔记。",
                  )}
                </section>
              </>
            ) : (
              <>
                <div>
                  <h2 className="wiki-panel-heading">与知识对话</h2>
                  <p className="mb-3 text-[11px] leading-6 text-muted-foreground">
                    围绕当前笔记提问、综合来源，或提出整理要求。更新需审阅后采纳。
                  </p>
                  <WorkspaceAssistant
                    scope="wiki"
                    title="询问或维护Wiki"
                    placeholder="询问当前笔记，比较来源，或描述应怎样补充…"
                    examples={[
                      "综合已有面经，给我准备清单并引用依据",
                      "补充当前页面的关联概念，保留不确定性",
                    ]}
                    context={() => ({
                      currentPath: active === GRAPH ? undefined : active,
                      hasUnsavedDraft: !!(active && drafts[active]),
                    })}
                    targetLabel={(action) =>
                      pages.find((p) => p.path === action.targetId)?.title ||
                      "Wiki 内容页"
                    }
                    onApply={async (actions) => {
                      for (const a of actions) {
                        if (a.kind !== "wiki")
                          throw Error("这里只能维护Wiki内容页");
                        if (
                          useKnowledgeStore.getState().drafts[a.targetId] !==
                          undefined
                        )
                          throw Error(
                            "相关页面有未保存正文，请先保存再重新整理",
                          );
                      }
                      const draft = await api.knowledgeProposeEdit(actions);
                      await api.knowledgeApplyDraft(draft.id);
                      await load();
                      if (active && active !== GRAPH) await select(active);
                      await refreshGraph();
                      onChange?.();
                    }}
                    onSaveAnswer={async (answer) => {
                      const path = await api.knowledgeSaveAnswer(answer);
                      await load();
                      await openPage(path);
                      await refreshGraph();
                      onChange?.();
                    }}
                  />
                </div>
                <section>
                  <h2 className="wiki-panel-heading">知识维护</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={maintaining}
                    onClick={() => void maintain()}
                  >
                    <RefreshCw className={maintaining ? "animate-spin" : ""} />
                    {maintaining ? "正在检查" : "维护 Wiki"}
                  </Button>
                  <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                    检查冲突、过时结论和知识空缺，生成待采纳更新。
                  </p>
                </section>
                {proposals.map((p) => (
                  <KnowledgeProposalCard
                    key={p.id}
                    {...p}
                    onResolved={(status) => {
                      resolveProposal(p.id);
                      if (status === "accepted")
                        void load().then(() => openPage(p.path));
                    }}
                  />
                ))}
                {pendingEntities.map((entity) => (
                  <section
                    key={entity.type + entity.title}
                    className="rounded-md border p-3 text-xs"
                  >
                    <h3 className="font-semibold">{entity.title}</h3>
                    <p className="my-2 line-clamp-3 leading-6 text-muted-foreground">
                      {entity.content}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => dismissEntity(entity)}
                      >
                        忽略
                      </Button>
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => void adopt(entity)}
                      >
                        采纳知识页
                      </Button>
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        </aside>
      )}
      <Dialog
        open={quick}
        onOpenChange={(v) => {
          setQuick(v);
          if (!v) {
            setQuickQuery("");
            setQuickIndex(0);
          }
        }}
      >
        <DialogContent className="gap-0 p-0 sm:max-w-xl" data-wiki-quick>
          <DialogHeader className="border-b p-4">
            <DialogTitle className="text-sm">快速打开笔记</DialogTitle>
            <DialogDescription className="text-xs">
              输入标题或路径，↑↓ 选择，Enter 打开。
            </DialogDescription>
          </DialogHeader>
          <div className="p-3">
            <Input
              autoFocus
              aria-label="快速查找Wiki笔记"
              placeholder="查找笔记…"
              value={quickQuery}
              onChange={(e) => {
                setQuickQuery(e.target.value);
                setQuickIndex(0);
              }}
              onKeyDown={(e) => {
                if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                  e.preventDefault();
                  setQuickIndex((i) =>
                    quickRows.length
                      ? (i +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          quickRows.length) %
                        quickRows.length
                      : 0,
                  );
                } else if (e.key === "Enter" && quickRows[quickIndex]) {
                  e.preventDefault();
                  void openPage(quickRows[quickIndex].path);
                  setQuick(false);
                  setQuickQuery("");
                  setQuickIndex(0);
                }
              }}
            />
            <div
              role="listbox"
              aria-label="快速打开结果"
              className="mt-2 max-h-80 overflow-y-auto"
            >
              {quickRows.map((p, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={quickIndex === i}
                  key={p.path}
                  onClick={() => {
                    void openPage(p.path);
                    setQuick(false);
                    setQuickQuery("");
                    setQuickIndex(0);
                  }}
                  className="wiki-quick-row"
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {p.title}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {p.path}
                    </span>
                  </span>
                  {drafts[p.path] !== undefined && (
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--app-accent)]">
                      草稿
                    </span>
                  )}
                </button>
              ))}
              {!quickRows.length && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  没有找到笔记
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {create && (
        <WikiCreateDialog
          kind={create}
          folder={folder}
          folders={folders}
          pages={pages}
          onClose={() => setCreate(null)}
          onCreated={async (path) => {
            await refreshFolders();
            selectFolder(
              create === "folder"
                ? path
                : path.split("/").slice(0, -1).join("/"),
            );
            if (create === "note") {
              await load();
              await openPage(path);
              setEditing(true);
            }
            onChange?.();
          }}
        />
      )}
      {properties && selected && ready && (
        <WikiPropertiesDialog
          page={selected}
          content={selectedContent}
          suggestions={allTags}
          onClose={() => setProperties(false)}
          onSaved={async () => {
            await load();
            await select(selected.path);
            await refreshGraph();
            onChange?.();
          }}
        />
      )}
      {knowledgeDraft && (
        <KnowledgeDraftDialog
          key={knowledgeDraft.id}
          draft={knowledgeDraft}
          onClose={() => setKnowledgeDraft(null)}
          onApplied={() => {
            void load();
            void refreshGraph();
            onChange?.();
          }}
        />
      )}
      {conflict && (
        <WikiConflictDialog
          conflict={conflict}
          onClose={() => setConflict(null)}
          onResolve={async (choice) => {
            if (
              useKnowledgeStore.getState().drafts[conflict.path] !==
              conflict.draft
            )
              throw Error("草稿又有变化，请先关闭此窗口核对");
            if (choice === "draft")
              await api.knowledgeWrite(
                conflict.path,
                conflict.text,
                conflict.onDisk,
              );
            clearSavedDraft(
              conflict.path,
              conflict.draft as string | PurposeFields | undefined,
            );
            if (useWikiWorkspace.getState().active === conflict.path)
              await select(conflict.path);
            await load();
            await refreshGraph();
            toast.success(choice === "draft" ? "草稿已保存" : "已使用磁盘版本");
          }}
        />
      )}
      <Dialog
        open={lintIssues !== null}
        onOpenChange={(v) => {
          if (!v) setLintIssues(null);
        }}
      >
        <DialogContent className="max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>结构与链接检查</DialogTitle>
            <DialogDescription>
              {lintIssues?.length
                ? `${lintIssues.length} 项需要留意；检查不会直接修改笔记。`
                : "没有发现断链、重复标题或孤立知识页。"}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 overflow-y-auto text-xs leading-6">
            {lintIssues?.map((issue, i) => (
              <li key={i} className="rounded-md bg-muted p-2">
                {issue}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  );
}
