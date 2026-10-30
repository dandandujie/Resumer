import assert from 'node:assert/strict';
import { DocumentSaveSession } from '../src/lib/document-save-session';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};
async function main() {
let value = 1;
let exports = 0;
const writes: number[][] = [];
const gate = deferred();
const session = new DocumentSaveSession(1, async () => { exports++; return [value]; }, async (revision, bytes) => {
  writes.push([revision, ...bytes]);
  if (revision === 1) await gate.promise;
  return revision + 1;
}, () => {});
await session.flush();
assert.equal(exports, 0, '未编辑不重写原 DOCX');
session.changed();
const pending = session.flush();
await Promise.resolve();
value = 2; session.changed();
assert.equal(session.flush(), pending, '并发保存复用同一队列');
gate.resolve();
await pending;
assert.deepEqual(writes, [[1, 1], [2, 2]], '保存期间输入仍按新 revision 持久化');
assert.equal(session.dirty, false);
let reject = true;
const retry = new DocumentSaveSession(7, async () => [3], async (rev) => {
  if (reject) throw new Error('disk full');
  return rev + 1;
}, () => {});
retry.changed();
await assert.rejects(retry.flush(), /disk full/);
assert.equal(retry.dirty, true);
reject = false;
await retry.flush();
assert.equal(retry.dirty, false);
const finalGate = deferred();
const finalWrites: number[][] = [];
let destroyed = false;
const finishing = new DocumentSaveSession(1, async () => {
  assert.equal(destroyed, false, '卸载后不得再次访问编辑器'); return [1];
}, async (revision, bytes) => {
  finalWrites.push(bytes);
  if (revision === 1) await finalGate.promise;
  return revision + 1;
}, () => {});
finishing.changed();
void finishing.flush();
await Promise.resolve();
finishing.changed();
const finalSave = finishing.finish(Promise.resolve([2]));
destroyed = true;
finalGate.resolve();
await finalSave;
assert.deepEqual(finalWrites, [[1], [2]], '卸载时旧写入完成后仍保存最终快照');
let automatic = false;
const policyWrites: number[][] = [];
const policy = new DocumentSaveSession(1, async () => [9], async (revision, bytes) => { policyWrites.push(bytes); return revision + 1; }, () => {}, () => automatic);
policy.changed();
await new Promise(resolve => setTimeout(resolve, 1250));
assert.equal(policyWrites.length, 0, '默认手动模式不启动定时写入');
automatic = true; policy.scheduleAutoSave(); automatic = false;
await new Promise(resolve => setTimeout(resolve, 1250));
assert.equal(policyWrites.length, 0, '定时任务触发前关掉开关也不能写入');
const discardGate = deferred(); let discardValue = 1; const discardWrites: number[][] = [];
const discarding = new DocumentSaveSession(1, async () => [discardValue], async (revision, bytes) => { discardWrites.push(bytes); await discardGate.promise; return revision+1; }, () => {});
discarding.changed(); const oldWrite = discarding.flush(); await Promise.resolve(); discardValue = 2; discarding.changed();
const discarded = discarding.discard(); discardGate.resolve(); await oldWrite; await discarded;
assert.deepEqual(discardWrites, [[1]], '丢弃只等待已经开始的写入，不能把后续未保存编辑顺手写入');
assert.equal(discarding.dirty, false);
const toggleGate = deferred(); let toggleValue=1; let autoDuringWrite=true; const toggleWrites:number[][]=[];
const toggled = new DocumentSaveSession(1, async()=>[toggleValue], async(revision,bytes)=>{toggleWrites.push(bytes);if(revision===1)await toggleGate.promise;return revision+1;},()=>{},()=>autoDuringWrite);
toggled.changed(); const autoWrite=toggled.flush(false);await Promise.resolve();autoDuringWrite=false;toggleValue=2;toggled.changed();toggleGate.resolve();await autoWrite;
assert.deepEqual(toggleWrites,[[1]], '自动保存进行中关闭开关，不能继续写入关闭后的编辑');
assert.equal(toggled.dirty,true);
await toggled.flush();assert.deepEqual(toggleWrites,[[1],[2]], '用户点击保存后才继续写入后续编辑');
console.log('PASS 原文档保存：无改动、并发输入、失败保留及重试');

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
