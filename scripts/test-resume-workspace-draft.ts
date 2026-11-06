import assert from 'node:assert/strict';
import { clearResumeWorkspaceDraft, emptyResumeWorkspaceDraft, loadResumeWorkspaceDraft, saveResumeWorkspaceDraft } from '../src/lib/resume-workspace-draft';
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const draft = { ...emptyResumeWorkspaceDraft(), goal: '突出跨团队合作', title: '产品实习', company: '星河', role: '产品', jobDescription: '用户研究与需求协作', request: { id: '17f42b12-8675-40af-a9c6-83c9a9924939', fingerprint: 'original-operation' } };
saveResumeWorkspaceDraft(storage, 'base-a', draft);
assert.deepEqual(loadResumeWorkspaceDraft(storage, 'base-a'), draft, '刷新恢复全部输入与原请求标识');
assert.deepEqual(loadResumeWorkspaceDraft(storage, 'base-b'), emptyResumeWorkspaceDraft(), '不同基础简历不串草稿或请求');
const changed = { ...loadResumeWorkspaceDraft(storage, 'base-a'), goal: '保留新的想法' };
saveResumeWorkspaceDraft(storage, 'base-a', changed);
assert.equal(loadResumeWorkspaceDraft(storage, 'base-a').goal, '保留新的想法');
clearResumeWorkspaceDraft(storage, 'base-a');
assert.deepEqual(loadResumeWorkspaceDraft(storage, 'base-a'), emptyResumeWorkspaceDraft(), '创建成功清除后下次进入为空');
const unavailable = () => { throw new Error('storage unavailable'); };
assert.throws(() => saveResumeWorkspaceDraft({ setItem: unavailable }, 'base-a', draft), /storage unavailable/, '不能吞没本机暂存错误');
assert.throws(() => loadResumeWorkspaceDraft({ getItem: unavailable }, 'base-a'), /storage unavailable/);
assert.throws(() => clearResumeWorkspaceDraft({ removeItem: unavailable }, 'base-a'), /storage unavailable/);
assert.throws(() => loadResumeWorkspaceDraft({ getItem: () => '{broken' }, 'base-a'), SyntaxError, '损坏草稿必须显式报错');
assert.throws(() => loadResumeWorkspaceDraft({ getItem: () => JSON.stringify({ ...draft, request: { id: 3 } }) }, 'base-a'), /请求标识/, '不能带着损坏请求重试');
console.log('PASS 定向稿本机草稿：刷新恢复 / 请求ID保留 / 基础隔离 / 成功清空 / 存储错误');
