import assert from "node:assert/strict";
import {
  collectionTags,
  normalizeTags,
  matchesTags,
  countTags,
} from "../src/lib/knowledge-tags";
import {
  buildWikiTree,
  wikiBreadcrumb,
  wikiHeadings,
  resolveWikiFile,
  resolveWikiTarget,
  wikiSearchExcerpt,
  formatWikiTimestamp,
  wikiExtraProperties,
  reorderWikiTabs,
} from "../src/lib/wiki-workspace";
import type { KnowledgePageSummary } from "../src/lib/tauri-api";
assert.deepEqual(collectionTags({ category: "旧分类,不拆分" }), [
  "旧分类,不拆分",
]);
assert.deepEqual(collectionTags({ category: "兼容值", tags: [] }), []);
assert.deepEqual(normalizeTags([" #React ", "react", "前端", ""]), [
  "React",
  "前端",
]);
assert.equal(
  matchesTags(["前端"], {
    tags: ["前端", "面试"],
    match: "all",
    untagged: false,
  }),
  false,
);
assert.equal(
  matchesTags(["前端"], {
    tags: ["前端", "面试"],
    match: "any",
    untagged: false,
  }),
  true,
);
assert.equal(
  matchesTags(["React"], { tags: ["react"], match: "all", untagged: false }),
  true,
);
assert.equal(matchesTags([], { tags: [], match: "all", untagged: true }), true);
assert.equal(
  matchesTags(["标签"], { tags: [], match: "all", untagged: true }),
  false,
);
assert.equal(
  countTags([{ tags: ["React"] }, { tags: ["react", "前端"] }]).find(
    (t) => t.name === "React",
  )?.count,
  2,
);
const page = (path: string, title: string): KnowledgePageSummary => ({
  path,
  title,
  type: "note",
  tags: [],
  sources: [],
  summary: "",
  updated: "2026-10-30",
});
const tree = buildWikiTree(
  [
    page("wiki/companies/星河/二面.md", "二面准备"),
    page("purpose.md", "求职目标"),
  ],
  ["wiki", "wiki/空文件夹"],
);
assert.equal(tree[0].path, "wiki");
assert.equal(
  tree[0].children.some((n) => n.path === "wiki/空文件夹"),
  true,
);
assert.equal(
  tree[0].children.find((n) => n.path === "wiki/companies")?.children[0]
    .children[0].name,
  "二面准备",
);
assert.deepEqual(
  wikiBreadcrumb("wiki/companies/星河/二面.md").map((p) => p.label),
  ["求职 Wiki", "公司", "星河"],
);
assert.deepEqual(
  wikiHeadings("# 标题\n```md\n# 不是真标题\n```\n## 二级\n### 三级").map(
    (h) => h.text,
  ),
  ["标题", "二级", "三级"],
);
assert.equal(
  resolveWikiFile("wiki/sources/a.md", "../../materials/id/file.pdf"),
  "materials/id/file.pdf",
);
assert.equal(resolveWikiFile("wiki/sources/a.md", "../../../outside"), null);
assert.equal(
  resolveWikiTarget(
    [{ path: "wiki/concepts/cache.md", title: "缓存原理" }],
    "wiki/companies/a.md",
    "缓存原理.md",
  ),
  "wiki/concepts/cache.md",
);
assert.equal(
  resolveWikiTarget(
    [
      { path: "wiki/a/review.md", title: "复盘" },
      { path: "wiki/b/review.md", title: "另一篇" },
    ],
    "wiki/concepts/a.md",
    "review.md",
  ),
  null,
);
assert.equal(
  wikiSearchExcerpt(
    "---\ntitle: 秘密属性\n---\n" +
      "开场".repeat(100) +
      "量化结果" +
      "后续".repeat(100),
    "量化",
  ).includes("量化结果"),
  true,
);
assert.equal(
  wikiSearchExcerpt("---\ntitle: 不展示属性\n---\n## 正文", "正文").includes(
    "title:",
  ),
  false,
);
assert.equal(formatWikiTimestamp("2026-10-30"), "2026/10/30");
assert.equal(formatWikiTimestamp("2026-10-30T12:00:00Z").includes("T"), false);
assert.deepEqual(
  wikiExtraProperties(
    "---\ntitle: 笔记\nauthor: 作者\ncustom: 自定义\ntags: [前端]\n---\n正文",
  ).map((p) => p.key),
  ["author", "custom"],
);
assert.deepEqual(reorderWikiTabs(["a", "b", "c"], "a", "b"), ["b", "a", "c"]);
assert.deepEqual(reorderWikiTabs(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
console.log(
  "PASS 多标签语义、旧数据兼容、实际目录层级、阅读大纲与原件路径边界",
);
