import type { KnowledgePageSummary } from "./tauri-api";
export const WIKI_FOLDER_NAMES: Record<string, string> = {
  wiki: "求职 Wiki",
  companies: "公司",
  roles: "岗位",
  concepts: "概念",
  experiences: "经验",
  guides: "准备指南",
  questions: "综合问答",
  sources: "来源资料",
  skills: "岗位画像",
  sops: "工作流程",
  market: "市场",
};
export type WikiTreeNode = {
  path: string;
  name: string;
  folder: boolean;
  children: WikiTreeNode[];
  page?: KnowledgePageSummary;
};
export function buildWikiTree(
  pages: KnowledgePageSummary[],
  folders: string[],
  sort: "name" | "updated" = "name",
) {
  const root: WikiTreeNode = { path: "", name: "", folder: true, children: [] };
  const dirs = new Map<string, WikiTreeNode>([["", root]]);
  const ensure = (path: string): WikiTreeNode => {
    const found = dirs.get(path);
    if (found) return found;
    const segments = path.split("/"),
      name = segments.pop()!;
    const parent = ensure(segments.join("/"));
    const node = {
      path,
      name: WIKI_FOLDER_NAMES[name] || name,
      folder: true,
      children: [],
    };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const folder of folders) ensure(folder);
  for (const page of pages) {
    const parts = page.path.split("/");
    parts.pop();
    ensure(parts.join("/")).children.push({
      path: page.path,
      name: page.title || page.path.split("/").pop()!.replace(/\.md$/, ""),
      folder: false,
      children: [],
      page,
    });
  }
  const order = (node: WikiTreeNode) => {
    node.children.sort((a, b) =>
      a.folder !== b.folder
        ? a.folder
          ? -1
          : 1
        : sort === "updated" && !a.folder
          ? (b.page?.updated || "").localeCompare(a.page?.updated || "") ||
            a.name.localeCompare(b.name, "zh-CN")
          : a.name.localeCompare(b.name, "zh-CN"),
    );
    node.children.forEach(order);
  };
  order(root);
  return root.children;
}
export function wikiBreadcrumb(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.map((part, i) => ({
    label: WIKI_FOLDER_NAMES[part] || part,
    path: parts.slice(0, i + 1).join("/"),
  }));
}
export function wikiHeadings(body: string) {
  let fenced = false;
  const out: { text: string; level: number }[] = [];
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) {
      const m = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
      if (m) out.push({ text: m[2].replace(/[*_`]/g, ""), level: m[1].length });
    }
  }
  return out;
}
export function resolveWikiFile(page: string, href: string) {
  if (/^(raw|materials|skills)\//.test(href)) return href;
  const parts = page.split("/");
  parts.pop();
  for (const part of href.split("/")) {
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== ".") parts.push(part);
  }
  const path = parts.join("/");
  return /^(raw|materials|skills)\//.test(path) ? path : null;
}

export function formatWikiTimestamp(value: string) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", "/");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}
export function wikiSearchExcerpt(content: string, query: string, limit = 150) {
  const plain = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_m, path, label) => label || path.replace(/\.md$/, ""),
    )
    .replace(/[#*`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const key =
    query
      .trim()
      .split(/\s+/)
      .find((t) => plain.toLocaleLowerCase().includes(t.toLocaleLowerCase())) ||
    "";
  const index = key
    ? plain.toLocaleLowerCase().indexOf(key.toLocaleLowerCase())
    : 0;
  const start = Math.max(0, index - 45),
    end = Math.min(plain.length, start + limit);
  return (
    (start ? "…" : "") +
    plain.slice(start, end) +
    (end < plain.length ? "…" : "")
  );
}
export function resolveWikiTarget(
  pages: { path: string; title: string }[],
  from: string,
  target: string,
) {
  const path = target.endsWith(".md") ? target : target + ".md";
  if (pages.some((p) => p.path === path)) return path;
  const parent = from.split("/").slice(0, -1).join("/");
  const relative = parent + "/" + path;
  if (pages.some((p) => p.path === relative)) return relative;
  const needle = path.replace(/\.md$/, "").toLocaleLowerCase();
  const candidates = pages.filter(
    (p) =>
      p.title.toLocaleLowerCase() === needle ||
      p.path.split("/").pop()!.replace(/\.md$/, "").toLocaleLowerCase() ===
        needle,
  );
  return candidates.length === 1 ? candidates[0].path : null;
}
export function wikiExtraProperties(raw: string) {
  const header = raw
    .replace(/\r\n/g, "\n")
    .match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  if (!header) return [];
  const rows: { key: string; value: string }[] = [];
  let active: { key: string; value: string } | undefined;
  for (const line of header.split("\n")) {
    const match = line.match(/^([\w\u4e00-\u9fff-]+):\s*(.*)$/);
    if (match) {
      const key = match[1];
      active = { key, value: match[2] };
      if (
        !["title", "type", "tags", "updated", "sources", "related"].includes(
          key,
        )
      )
        rows.push(active);
    } else if (active && line.trim())
      active.value +=
        (active.value ? " · " : "") + line.trim().replace(/^-\s*/, "");
  }
  return rows.map((row) => {
    try {
      const v = JSON.parse(row.value);
      return { ...row, value: Array.isArray(v) ? v.join(" · ") : String(v) };
    } catch {
      return row;
    }
  });
}

export function reorderWikiTabs(tabs: string[], from: string, to: string) {
  const source = tabs.indexOf(from),
    target = tabs.indexOf(to);
  if (source < 0 || target < 0 || source === target) return tabs;
  const next = [...tabs];
  next.splice(source, 1);
  next.splice(target, 0, from);
  return next;
}
