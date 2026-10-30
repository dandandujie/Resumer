import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkDesignContract, projectRoot } from "./check-design-contract.mjs";
assert.deepEqual(checkDesignContract(), []);
const css = readFileSync(resolve(projectRoot, "src/globals.css"), "utf8");
assert(
  checkDesignContract({
    overrides: {
      "src/globals.css": css.replace(
        "--app-accent: #C2521D",
        "--app-accent: #00FF00",
      ),
    },
  }).some((s) => s.includes("--app-accent")),
  "核心强调色漂移必须失败",
);
assert(
  checkDesignContract({
    overrides: {
      "src/globals.css": css.replaceAll("Sora Variable", "Other Font"),
    },
  }).some((s) => s.includes("应用字体")),
  "字体替换必须失败",
);
const page = "src/pages/design-guard-fixture.tsx";
assert(
  checkDesignContract({
    extraFiles: [page],
    overrides: { [page]: '<button className="bg-emerald-600">保存</button>' },
  }).some((s) => s.includes("绿色系")),
  "新界面绿色按钮必须失败",
);
assert(
  checkDesignContract({
    extraFiles: [page],
    overrides: { [page]: "const style={'--app-accent':'#00FF00'};" },
  }).some((s) => s.includes("覆盖")),
  "页面私自覆盖品牌色必须失败",
);
const paper = "src/components/preview/templates/design-guard-fixture.tsx";
assert.deepEqual(
  checkDesignContract({
    extraFiles: [paper],
    overrides: {
      [paper]:
        '<article className="text-green-600">用户选择的简历主题</article>',
    },
  }),
  [],
  "应用规范不得锁死用户简历主题",
);
const shots = JSON.parse(
  readFileSync(
    resolve(projectRoot, "design/baseline/v1/screenshots.json"),
    "utf8",
  ),
);
shots[0].sha256 = "0".repeat(64);
assert(
  checkDesignContract({
    overrides: { "design/baseline/v1/screenshots.json": JSON.stringify(shots) },
  }).some((s) => s.includes("参考图")),
  "参考图替换不能悄悄放行",
);
console.log("PASS 设计守卫：正式基线、配色/字体漂移、局部覆盖与简历纸张边界");
