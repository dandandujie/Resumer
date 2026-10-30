import assert from "node:assert/strict";
import {
  buildJournalDraft,
  assertUnchanged,
  validateWorkspaceFields,
} from "../src/lib/workspace-plan";
import type { Application } from "../src/stores/journal-store";
import type { WorkspaceAction } from "../src/lib/tauri-api";
const app: Application = {
  id: "existing",
  resumeId: null,
  resumeVersionId: null,
  company: "星河",
  role: "前端",
  channel: "内推",
  appliedDate: "2026-10-30",
  status: "interview",
  hrName: "张",
  hrContact: "联系信息",
  jd: "原招聘信息",
  notes: "手动记录",
  nextFollowUp: "",
  interviews: [
    { id: "round1", round: "一面", notes: "原面试记录", createdAt: 1 },
  ],
  outcome: null,
  createdAt: 1,
  updatedAt: 2,
};
const action = (
  kind: WorkspaceAction["kind"],
  fields: WorkspaceAction["fields"],
  targetId = "existing",
  roundId = "",
): WorkspaceAction => ({ kind, fields, targetId, roundId, reason: "测试" });
const original = structuredClone(app);
const result = buildJournalDraft(
  [
    action("application", { role: "资深前端" }),
    action(
      "interview",
      { scheduledAt: "2026-11-01T14:30" },
      "existing",
      "round1",
    ),
    action("outcome", { result: "offer", reason: "通过" }),
  ],
  [app],
);
assert.equal(result.length, 1);
assert.equal(result[0].after.role, "资深前端");
assert.equal(result[0].after.jd, app.jd);
assert.equal(result[0].after.hrContact, app.hrContact);
assert.equal(result[0].after.notes, app.notes);
assert.equal(result[0].after.interviews?.[0].notes, "原面试记录");
assert.equal(result[0].after.status, "offer");
assert.deepEqual(app, original, "规划不修改原数据");
let sequence = 0;
const creates = buildJournalDraft(
  [
    action("application", { company: "A" }, "new:1"),
    action("interview", { round: "二面" }, "new:1"),
    action("application", { company: "B" }, "new:2"),
  ],
  [],
  () => `new-${++sequence}`,
);
assert.equal(creates.length, 2);
assert.equal(creates[0].after.interviews?.length, 1);
assert.equal(creates[1].after.company, "B");
assert.throws(
  () =>
    buildJournalDraft(
      [action("application", { company: "X" }, "spoofed")],
      [app],
    ),
  /未明确/,
);
assert.throws(
  () =>
    buildJournalDraft(
      [action("interview", { notes: "X" }, "existing", "missing")],
      [app],
    ),
  /不存在/,
);
assert.throws(
  () => assertUnchanged(app, { ...app, notes: "新的手动记录" }),
  /已有变化/,
);
assert.doesNotThrow(() => assertUnchanged(app, structuredClone(app)));
for (const [kind, fields] of [
  ["application", { appliedDate: "2026-02-30" }],
  ["interview", { scheduledAt: "2026-11-01T24:30" }],
  ["interview", { scheduledAt: "2026-02-29T14:00" }],
  ["interview", { durationMin: -1 }],
  ["interview", { durationMin: 4.5 }],
  ["application", { status: "invented" }],
  ["application", { id: "overwrite" }],
  ["application", { company: 3 }],
] as [WorkspaceAction["kind"], WorkspaceAction["fields"]][])
  assert.throws(() => validateWorkspaceFields(action(kind, fields)));
assert.doesNotThrow(() =>
  validateWorkspaceFields(action("application", { appliedDate: "2028-02-29" })),
);
assert.doesNotThrow(() =>
  validateWorkspaceFields(
    action("interview", { scheduledAt: "2028-02-29T23:59", durationMin: 90 }),
  ),
);
console.log(
  "PASS 自然语言变更规划：保留字段、别名关联、目标范围、过期保护、真实日期与字段类型",
);
