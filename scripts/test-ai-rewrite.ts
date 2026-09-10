import assert from 'node:assert/strict';
import { buildRewriteInstruction } from '../src/lib/ai-rewrite';

const context = { sectionId: 'sec-1', sectionTitle: '工作经历', item: '字节跳动 · 后端', field: '亮点' };
const zh = buildRewriteInstruction('quantify', '负责订单系统', context, 'zh');
assert.ok(zh.includes('sectionId: sec-1'), '必须带 sectionId，助手才能精确改这一条');
assert.ok(zh.includes('工作经历 › 字节跳动 · 后端 › 亮点'));
assert.ok(zh.includes('「负责订单系统」'));
assert.ok(zh.includes('绝不编造'));
assert.ok(zh.includes('updateSection'));

const en = buildRewriteInstruction('jd', 'Built APIs', { ...context, item: undefined }, 'en');
assert.ok(en.startsWith('Rewrite this entry at "工作经历 › 亮点"'));
assert.ok(en.includes('JD'));
assert.ok(!en.includes('请改写'));

const star = buildRewriteInstruction('star', 'x', context, 'zh-CN');
assert.ok(star.includes('STAR'));
console.log('ai-rewrite: 8 assertions passed');
