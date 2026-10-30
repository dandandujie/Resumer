import { useMemo } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Bookmark,
  FilePlus,
  FolderPlus,
  ChevronsDownUp,
  ArrowDownAZ,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildWikiTree,
  wikiSearchExcerpt,
  type WikiTreeNode,
} from "@/lib/wiki-workspace";
import { useWikiWorkspace } from "@/stores/wiki-workspace-store";
import type * as api from "@/lib/tauri-api";
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(
    "(" +
      terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") +
      ")",
    "ig",
  );
  return (
    <>
      {text.split(pattern).map((part, i) =>
        terms.some(
          (t) => t.toLocaleLowerCase() === part.toLocaleLowerCase(),
        ) ? (
          <mark
            key={i}
            className="rounded-sm bg-[var(--app-accent-soft)] px-0.5 text-[var(--app-accent)]"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
export function WikiExplorer({
  pages,
  folders,
  selected,
  drafts,
  mode,
  setMode,
  query,
  setQuery,
  hits,
  searching,
  onOpen,
  onFolder,
  onNew,
  onNewFolder,
}: {
  pages: api.KnowledgePageSummary[];
  folders: string[];
  selected: string | null;
  drafts: Record<string, unknown>;
  mode: "files" | "search" | "bookmarks";
  setMode: (v: "files" | "search" | "bookmarks") => void;
  query: string;
  setQuery: (q: string) => void;
  hits: api.KnowledgeSearchHit[];
  searching: boolean;
  onOpen: (path: string) => void;
  onFolder: (path: string) => void;
  onNew: () => void;
  onNewFolder: () => void;
}) {
  const { collapsed, toggleFolder, bookmarks, sort } = useWikiWorkspace();
  const tree = useMemo(
    () => buildWikiTree(pages, folders, sort),
    [pages, folders, sort],
  );
  const rows =
    mode === "bookmarks"
      ? pages.filter((p) => bookmarks.includes(p.path))
      : pages.filter((p) => {
          const needle = query.trim().toLocaleLowerCase();
          return needle.startsWith("#")
            ? p.tags.some((t) =>
                t.toLocaleLowerCase().includes(needle.slice(1)),
              )
            : `${p.title} ${p.path} ${p.summary}`
                .toLocaleLowerCase()
                .includes(needle) || hits.some((h) => h.path === p.path);
        });
  const render = (nodes: WikiTreeNode[], depth = 0) =>
    nodes.map((node) => (
      <div key={node.path} role="none">
        <button
          type="button"
          role="treeitem"
          data-knowledge-path={node.folder ? undefined : node.path}
          data-wiki-folder={node.folder ? node.path : undefined}
          aria-expanded={
            node.folder ? !collapsed.includes(node.path) : undefined
          }
          aria-selected={!node.folder && selected === node.path}
          title={node.path}
          className="wiki-tree-row"
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => {
            if (node.folder) {
              toggleFolder(node.path);
              onFolder(node.path);
            } else onOpen(node.path);
          }}
          onKeyDown={(e) => {
            if (
              node.folder &&
              e.key === "ArrowRight" &&
              collapsed.includes(node.path)
            ) {
              e.preventDefault();
              toggleFolder(node.path);
            }
            if (
              node.folder &&
              e.key === "ArrowLeft" &&
              !collapsed.includes(node.path)
            ) {
              e.preventDefault();
              toggleFolder(node.path);
            }
          }}
        >
          {node.folder ? (
            <>
              <ChevronRight
                className={`size-3 shrink-0 transition-transform ${collapsed.includes(node.path) ? "" : "rotate-90"}`}
              />
              {collapsed.includes(node.path) ? (
                <Folder className="size-3.5 shrink-0" />
              ) : (
                <FolderOpen className="size-3.5 shrink-0" />
              )}
            </>
          ) : (
            <FileText className="ml-4 size-3.5 shrink-0 opacity-55" />
          )}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {!node.folder && drafts[node.path] !== undefined && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-[var(--app-accent)]"
              aria-label="未保存草稿"
            />
          )}
        </button>
        {node.folder && !collapsed.includes(node.path) && (
          <div role="group" className="wiki-tree-branch">
            {render(node.children, depth + 1)}
            {!node.children.length && (
              <p
                className="py-1 text-[10px] text-muted-foreground"
                style={{ paddingLeft: 28 + (depth + 1) * 14 }}
              >
                空文件夹
              </p>
            )}
          </div>
        )}
      </div>
    ));
  return (
    <aside className="wiki-explorer" data-wiki-explorer>
      <div className="wiki-explorer-tabs" role="tablist" aria-label="Wiki导航">
        {(
          [
            { id: "files", label: "文件", Icon: Folder },
            { id: "search", label: "搜索", Icon: Search },
            { id: "bookmarks", label: "收藏", Icon: Bookmark },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            type="button"
            role="tab"
            aria-selected={mode === id}
            key={id}
            onClick={() => setMode(id)}
            title={label}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b px-2">
        <span className="mr-auto pl-1 text-[11px] font-medium text-muted-foreground">
          {mode === "files"
            ? "文件目录"
            : mode === "search"
              ? "全文搜索"
              : "已收藏的笔记"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          title="新建笔记"
          aria-label="新建Wiki笔记"
          onClick={onNew}
        >
          <FilePlus />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="新建文件夹"
          aria-label="新建Wiki文件夹"
          onClick={onNewFolder}
        >
          <FolderPlus />
        </Button>
        {mode === "files" && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={
                sort === "name" ? "改为按更新时间排序" : "改为按名称排序"
              }
              title={sort === "name" ? "按名称排序" : "按更新时间排序"}
              onClick={() =>
                useWikiWorkspace.setState({
                  sort: sort === "name" ? "updated" : "name",
                })
              }
            >
              <ArrowDownAZ />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="折叠所有文件夹"
              title="折叠所有文件夹"
              onClick={() => useWikiWorkspace.setState({ collapsed: folders })}
            >
              <ChevronsDownUp />
            </Button>
          </>
        )}
      </div>
      {mode === "search" && (
        <div className="shrink-0 border-b p-2">
          <Input
            autoFocus
            aria-label="搜索Wiki笔记"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索全文，或 #标签…"
            className="h-8 text-xs"
          />
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            {searching ? "正在搜索全文…" : `${rows.length} 篇匹配`}
          </p>
        </div>
      )}
      <div
        className="wiki-explorer-scroll"
        role={mode === "files" ? "tree" : undefined}
        aria-label={mode === "files" ? "Wiki文件目录" : undefined}
        onKeyDown={(e) => {
          if (
            !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) ||
            mode !== "files"
          )
            return;
          e.preventDefault();
          const rows = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "[role=treeitem]",
            ),
          ];
          const i = rows.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? rows.length - 1
                : e.key === "ArrowDown"
                  ? (i + 1) % rows.length
                  : i < 0
                    ? rows.length - 1
                    : (i - 1 + rows.length) % rows.length;
          rows[next]?.focus();
        }}
      >
        {mode === "files"
          ? render(tree)
          : rows.map((page) => (
              <button
                type="button"
                key={page.path}
                data-knowledge-path={page.path}
                onClick={() => onOpen(page.path)}
                className="wiki-search-row"
                aria-current={selected === page.path ? "page" : undefined}
              >
                <span className="flex items-center gap-2">
                  <FileText className="size-3 shrink-0" />
                  <span className="truncate font-medium">{page.title}</span>
                </span>
                <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                  {page.path}
                </span>
                {mode === "search" && (
                  <span className="mt-1 block line-clamp-2 text-[11px] leading-5 text-[var(--app-text)]/80">
                    <Highlight
                      query={query}
                      text={wikiSearchExcerpt(
                        hits.find((h) => h.path === page.path)?.excerpt ||
                          page.summary,
                        query,
                      )}
                    />
                  </span>
                )}
              </button>
            ))}
        {mode !== "files" && !rows.length && (
          <p className="p-5 text-xs leading-6 text-muted-foreground">
            {searching
              ? "正在搜索全文…"
              : mode === "bookmarks"
                ? "收藏常用笔记，之后从这里直接打开。"
                : "没有匹配笔记。可以缩短关键词，或用 #标签 搜索。"}
          </p>
        )}
      </div>
      <div className="wiki-explorer-footer">
        <span>{pages.length} 篇笔记</span>
        <button
          type="button"
          className="app-text-action"
          onClick={() => setMode("search")}
        >
          搜索
        </button>
      </div>
    </aside>
  );
}
