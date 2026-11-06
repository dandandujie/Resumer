import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

// 执行真实 store / 编排，只替换 IPC；保留真实 Zustand、Promise 和保存队列。
const require = createRequire(import.meta.url);
const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
const clone = <T>(v: T): T => structuredClone(v);
function setup() {
  const db = new Map<string, any>();
  const calls: string[] = [], requests: string[] = [];
  const receipts = new Map<string, any[]>();
  const hooks: { fail?: boolean; commitGate?: ReturnType<typeof defer>; commitEntered?: ReturnType<typeof defer>; saveGate?: ReturnType<typeof defer>; saveEntered?: ReturnType<typeof defer> } = {};
  const content = (a: any) => { if (!a) return null; const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = a; return rest; };
  const api = {
    saveApplication: async (a: any) => { calls.push('save'); hooks.saveEntered?.resolve(); await hooks.saveGate?.promise; db.set(a.id, clone(a)); return clone(a); },
    commitJournalPlan: async (plan: any) => {
      calls.push('commit'); requests.push(JSON.stringify(plan)); hooks.commitEntered?.resolve(); await hooks.commitGate?.promise;
      if (hooks.fail) { hooks.fail = false; throw Error('injected transaction failure'); }
      if (receipts.has(plan.id)) return clone(receipts.get(plan.id)!);
      for (const entry of plan.entries) assert.deepEqual(content(db.get(entry.after.id)), content(entry.before));
      const saved = plan.entries.map((e: any) => ({ ...clone(e.after), createdAt: e.before?.createdAt || 10, updatedAt: 10 }));
      for (const a of saved) db.set(a.id, clone(a));
      receipts.set(plan.id, saved); return clone(saved);
    },
  };
  const modules: Record<string, any> = {};
  function load(path: string) {
    if (modules[path]) return modules[path];
    const exports = {}; modules[path] = exports;
    const code = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, {
      exports, require: (name: string) => {
        if (name === '@/lib/tauri-api') return api;
        if (name === '@/lib/utils') return { generateId: randomUUID };
        if (name.includes('recording-store')) return { useRecordingStore: { getState: () => ({ drafts: {} }) } };
        if (name.includes('workspace-plan')) return load('src/lib/workspace-plan.ts');
        if (name.includes('journal-values')) return load('src/lib/journal-values.ts');
        if (name.includes('journal-store')) return load('src/stores/journal-store.ts');
        if (name === '@tauri-apps/api/event') return { listen: async () => () => {} };
        return require(name);
      }, crypto: { randomUUID }, structuredClone, Date, Promise, setTimeout, clearTimeout, console,
    });
    return exports;
  }
  const store = load('src/stores/journal-store.ts').useJournalStore;
  const { applyJournalActions } = load('src/lib/workspace-actions.ts');
  const base = { id: 'existing', resumeId: null, resumeVersionId: null, company: '公司', role: '原岗位', channel: '', appliedDate: '2026-10-31', status: 'submitted', hrName: '', hrContact: '', jd: '', notes: '', nextFollowUp: '', interviews: [], outcome: null, createdAt: 1, updatedAt: 1 };
  const seed = () => { db.set(base.id, clone(base)); store.setState({ applications: [clone(base)] }); };
  const action = (fields: any, targetId = 'existing') => ({ kind: 'application', targetId, fields, reason: 'test' });
  return { db, calls, requests, hooks, store, applyJournalActions, base, seed, action };
}
async function main() {
  {
    const t = setup();
    const actions = [t.action({ company: 'A' }, 'new:a'), t.action({ company: 'B' }, 'new:b')];
    t.hooks.fail = true;
    await assert.rejects(t.applyJournalActions(actions, []), /injected/);
    assert.equal(t.db.size, 0); assert.equal(t.store.getState().applications.length, 0);
    const ids = await t.applyJournalActions(actions, []);
    assert.equal(t.requests[0], t.requests[1], '失败重试使用相同 planId、记录 ID 和请求正文');
    assert.equal(t.db.size, 2);
    assert.deepEqual(await t.applyJournalActions(actions, []), ids);
    assert.equal(t.calls.length, 2, '成功提案重复点击复用结果');
  }
  {
    const t = setup(); t.seed();
    t.hooks.saveGate = defer(); t.hooks.saveEntered = defer();
    t.store.getState().updateApplication('existing', { notes: '生成提案前的未落盘输入' });
    const base = clone(t.store.getState().applications);
    const applying = t.applyJournalActions([t.action({ role: 'AI岗位' })], base);
    await t.hooks.saveEntered.promise;
    assert.equal(t.calls.includes('commit'), false, '批次等待已有保存');
    t.hooks.saveGate.resolve(); await applying;
    assert.deepEqual(t.calls, ['save', 'commit']);
    assert.equal(t.db.get('existing').notes, '生成提案前的未落盘输入');
    assert.equal(t.db.get('existing').role, 'AI岗位');
  }
  {
    const t = setup(); t.seed();
    t.hooks.commitGate = defer(); t.hooks.commitEntered = defer();
    const applying = t.applyJournalActions([t.action({ role: 'AI岗位' })], [clone(t.base)]);
    await t.hooks.commitEntered.promise;
    t.store.getState().updateApplication('existing', { notes: '提交期间的新输入' });
    const pendingSave = t.store.getState().flushApplication('existing');
    t.hooks.commitGate.resolve(); await applying; await pendingSave;
    assert.deepEqual(t.calls, ['commit', 'save']);
    assert.equal(t.db.get('existing').role, 'AI岗位', '排队保存不能把 AI 岗位改回旧值');
    assert.equal(t.db.get('existing').notes, '提交期间的新输入');
    assert.equal(t.store.getState().applications[0].notes, '提交期间的新输入');
  }
  {
    const t = setup(); t.seed();
    t.store.getState().updateApplication('existing', { notes: '新的手动编辑' });
    await assert.rejects(t.applyJournalActions([t.action({ role: '不应应用' })], [clone(t.base)]), /已有变化/);
    assert.equal(t.calls.includes('commit'), false);
    assert.equal(t.store.getState().applications[0].notes, '新的手动编辑');
  }
  console.log('PASS 投递批次执行：失败重试、内存提交时机、队列顺序、提交中编辑与过期保护');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
