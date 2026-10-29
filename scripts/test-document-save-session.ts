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
console.log('PASS 原文档保存：无改动、并发输入、失败保留及重试');

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
