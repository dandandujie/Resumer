import assert from 'node:assert/strict';
import { parsePurpose, serializePurpose, stripFrontmatter, wikilinksToMarkdown } from '../src/lib/knowledge-page';

// purpose.md 往返：写出的必须是真实换行，读回字段一致（曾因字面量 \n 写坏文件）
const fields = { role: '后端工程师', city: '上海、杭州', industry: '互联网', constraints: '不接受 996', other: '' };
const markdown = serializePurpose(fields);
assert.ok(markdown.includes('\n## 目标岗位\n后端工程师\n'), markdown);
assert.ok(!markdown.includes('\\n'), '不得出现字面量 \\n');
assert.deepEqual(parsePurpose(markdown), fields);
assert.deepEqual(parsePurpose(markdown.replace(/\n/g, '\r\n')), fields);
assert.deepEqual(parsePurpose('# 求职目标\n\n- 目标岗位：\n'), {
  role: '', city: '', industry: '', constraints: '', other: '',
});

assert.equal(stripFrontmatter('---\ntitle: a\n---\n# 标题\n正文'), '# 标题\n正文');
assert.equal(stripFrontmatter('---\r\ntitle: a\r\n---\r\n正文'), '正文');
assert.equal(stripFrontmatter('没有 frontmatter'), '没有 frontmatter');

assert.equal(
  wikilinksToMarkdown('见 [[wiki/companies/字节跳动.md|字节]] 和 [[wiki/roles/backend#要求]]'),
  '见 [字节](wiki:wiki/companies/%E5%AD%97%E8%8A%82%E8%B7%B3%E5%8A%A8.md) 和 [backend](wiki:wiki/roles/backend.md)',
);
assert.equal(wikilinksToMarkdown('无链接 [普通](https://x.y)'), '无链接 [普通](https://x.y)');

console.log('knowledge-page: 9 assertions passed');
