// 设计语义守卫；不锁定源文件哈希或把每次功能变更当作重新设计。
import { readFileSync, readdirSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export const projectRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const canonical = (s) => s.replace(/'/g, '"').replace(/\s+/g, "").toLowerCase();
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
function declarations(body) {
  return Object.fromEntries(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map(([, key, value]) => [
      key,
      value.trim(),
    ]),
  );
}
function rule(css, selector) {
  for (const [, selectors, body] of stripComments(css).matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    if (canonical(selectors) === canonical(selector)) return declarations(body);
  }
  return {};
}
function filesUnder(root, dir) {
  const out = [];
  for (const entry of readdirSync(resolve(root, dir), {
    withFileTypes: true,
  })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...filesUnder(root, path));
    else if ([".ts", ".tsx", ".css"].includes(extname(path))) out.push(path);
  }
  return out;
}
export function checkDesignContract({
  root = projectRoot,
  overrides = {},
  extraFiles = [],
} = {}) {
  const read = (path) =>
    overrides[path] ?? readFileSync(resolve(root, path), "utf8");
  const contract = JSON.parse(read("design/baseline/v1/contract.json"));
  const issues = [];
  const require = (condition, message) => {
    if (!condition) issues.push(message);
  };
  const css = read("src/globals.css"),
    workspace = read("src/styles/workspace.css");
  const light = rule(css, 'html[data-design="stats"]'),
    dark = {
      ...light,
      ...rule(css, 'html[data-design="stats"][data-appearance="dark"]'),
    };
  for (const [mode, expected] of Object.entries(contract.palette))
    for (const [name, value] of Object.entries(expected))
      require(canonical((mode === "light" ? light : dark)[name] || "") ===
        canonical(value), `${mode} ${name} 偏离已确认颜色 ${value}`);
  for (const entry of contract.scaleRules) {
    const found = rule(workspace, entry.selector);
    for (const [name, value] of Object.entries(entry.properties))
      require(canonical(found[name] || "") ===
        canonical(value), `${entry.selector} 的 ${name} 偏离设计基线 ${value}`);
  }
  require(/--font-sans\s*:[^;]*Sora Variable[^;]*PingFang SC/.test(
    css,
  ), "应用字体应继续使用 Sora Variable 与中文系统字体回退");
  require(read("src/main.tsx").includes(
    "@fontsource-variable/sora",
  ), "缺少共享 Sora 字体入口");
  const button = read("src/components/ui/button.tsx");
  for (const name of contract.buttonVariants)
    require(new RegExp(`\\b${name}\\s*:`).test(
      button,
    ), `缺少共享按钮变体 ${name}`);
  require(button.includes("data-ui-button") &&
    button.includes("data-variant"), "共享按钮必须保留状态样式入口");
  for (const state of [":hover", ":active", ":disabled", ":focus-visible"])
    require(workspace.includes(state), `共享控件缺少 ${state} 状态`);
  const files = new Set([
    ...contract.scanDirectories.flatMap((dir) => filesUnder(root, dir)),
    ...extraFiles,
  ]);
  for (const file of files) {
    if (
      contract.contentAppearanceExceptions.some(
        (e) =>
          file === e.path ||
          file.startsWith(e.path.endsWith("/") ? e.path : e.path + "/"),
      )
    )
      continue;
    const text = read(file);
    require(!/(?:bg|text|border|ring|outline|from|via|to)-(?:green|emerald|lime|teal)-\d{2,3}\b/.test(
      text,
    ), `${file} 引入应用绿色系工具类，请使用共享语义色`);
    require(!/["']?--app-[\w-]+["']?\s*:/.test(
      stripComments(text),
    ), `${file} 覆盖了全局 --app-* 语义色，请在共享样式中维护`);
  }
  const screenshots = JSON.parse(read("design/baseline/v1/screenshots.json"));
  for (const shot of screenshots) {
    if (basename(shot.path) !== shot.path || !shot.path.endsWith(".png")) {
      issues.push("参考图路径无效");
      continue;
    }
    try {
      const bytes = readFileSync(
        resolve(root, "design/baseline/v1", shot.path),
      );
      require(createHash("sha256").update(bytes).digest("hex") ===
        shot.sha256, `参考图 ${shot.path} 已改变，请保留已确认的原始参考`);
    } catch {
      issues.push(`缺少参考图 ${shot.path}`);
    }
  }
  require(contract.status === "approved" &&
    contract.version === "1.0", "设计基线必须保留明确的已确认版本");
  require(read("AGENTS.md").includes("DESIGN.md") &&
    read("AGENTS.md").includes(
      "check:design",
    ), "项目指令必须接入设计规范与检查入口");
  require(read("DESIGN.md").includes("已获用户确认") &&
    !read("DESIGN.md").includes(
      "状态：**待用户体验确认**",
    ), "设计文档尚未升级为已确认规范");
  return issues;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const issues = checkDesignContract();
  if (issues.length) {
    for (const issue of issues) console.error("FAIL " + issue);
    process.exitCode = 1;
  } else
    console.log(
      "PASS Resumer 设计基线 v1.0：颜色、尺度、字体、控件状态与页面语义色",
    );
}
