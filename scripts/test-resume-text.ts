import assert from 'node:assert/strict';
import {
  applyStyle,
  clearStyle,
  commonStyle,
  md,
  normalizeRuns,
  parseInline,
  plainText,
  replaceText,
  serializeInline,
  type InlineRun,
} from '../src/lib/resume-text';

// 与 src-tauri/src/export/inline.rs 的用例对齐：同一段标记，前端出 HTML，Rust 出 Run
assert.equal(md('**粗体** *斜体* __下划线__ `代码`'), '<strong>粗体</strong> <em>斜体</em> <u>下划线</u> <code>代码</code>');
assert.equal(md('{{color=#C00}}红{{/color}}'), '<span data-fmt style="color:#c00">红</span>');
assert.equal(md('{{size=12}}大{{/size}}'), '<span data-fmt style="font-size:12pt">大</span>');
assert.ok(md('{{font=songti}}宋{{/font}}').includes('font-family:') && md('{{font=songti}}宋{{/font}}').includes('SimSun'));
assert.equal(
  md('{{color=#c00}}{{size=14}}**重点**{{/size}}{{/color}}'),
  '<span data-fmt style="color:#c00;font-size:14pt"><strong>重点</strong></span>',
);
// 非法值与未闭合：标记按普通文本保留（与 Rust 一致，不静默丢弃）
assert.equal(plainText('{{color=red}}x{{/color}}'), '{{color=red}}x{{/color}}');
assert.equal(plainText('{{size=99}}x{{/size}}'), '{{size=99}}x{{/size}}');
assert.equal(plainText('{{color=#c00}}未闭合'), '{{color=#c00}}未闭合');
assert.equal(plainText('孤立{{/size}}'), '孤立{{/size}}');
assert.equal(plainText('未闭合 **标记'), '未闭合 **标记');
// 未知字体 id 与 Rust 一样消费标记，但不产生样式
assert.equal(md('{{font=nope}}x{{/font}}'), 'x');
// HTML 转义
assert.equal(md('{{color=#c00}}<b>{{/color}}'), '<span data-fmt style="color:#c00">&lt;b&gt;</span>');
// 开关标记按 Rust 的状态机解析：粗斜交叠
assert.deepEqual(parseInline('***a***'), [{ text: 'a', bold: true, italic: true }]);
assert.deepEqual(parseInline('*a***b**'), [{ text: 'a', italic: true }, { text: 'b', bold: true }]);
// 转义
assert.equal(plainText('5\\*8 \\_\\_init\\_\\_ \\`x\\` a\\\\b \\{{color=#c00}}'), '5*8 __init__ `x` a\\b {{color=#c00}}');

// 多行：列表、换行、跨行样式各行闭合
assert.equal(
  md('第一行\n- **要点一\n- 要点二**\n\n尾行'),
  '第一行<ul style="margin:2px 0;padding-left:1.5em;list-style-type:disc"><li><strong>要点一</strong></li>'
  + '<li><strong>要点二</strong></li></ul>尾行',
);
assert.equal(md('**甲**\n乙'), '<strong>甲</strong><br>乙');
assert.equal(md('- \n正文'), '-<br>正文');
assert.equal(md('甲\n\n乙'), '甲<br><br>乙');
assert.equal(md('**甲**\n'), '<strong>甲</strong><br>');

// 序列化是解析的逆运算：随机片段往返不变
const alphabet = ['a', '中', ' ', '*', '_', '`', '\\', '{', '}', '\n', '-', '='];
const colors = ['#c00', '#1f2937', undefined];
let seed = 7;
const random = (n: number) => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) % n;
};
for (let round = 0; round < 3000; round += 1) {
  const runs: InlineRun[] = [];
  for (let i = random(5); i >= 0; i -= 1) {
    let text = '';
    for (let j = random(4); j >= 0; j -= 1) text += alphabet[random(alphabet.length)];
    runs.push({
      text,
      bold: random(2) === 1 || undefined,
      italic: random(3) === 1 || undefined,
      underline: random(3) === 1 || undefined,
      code: random(5) === 1 || undefined,
      color: colors[random(colors.length)],
      size: random(4) === 1 ? 10.5 : undefined,
      font: random(5) === 1 ? 'calibri' : undefined,
      spacing: [undefined, -2, -0.5, 0, 1.5, 10][random(6)],
    });
  }
  const expected = normalizeRuns(runs);
  const serialized = serializeInline(runs);
  assert.deepEqual(parseInline(serialized), expected, `往返失败：${JSON.stringify(runs)} → ${serialized}`);
}

// 编辑操作
const base = parseInline('负责**核心**模块');
assert.equal(serializeInline(applyStyle(base, 0, 2, { color: '#c00' })), '{{color=#c00}}负责{{/color}}**核心**模块');
assert.equal(serializeInline(applyStyle(base, 1, 4, { bold: undefined })), '负责核心模块');
assert.equal(serializeInline(clearStyle(parseInline('{{size=14}}**全部**{{/size}}'), 0, 2)), '全部');
assert.deepEqual(commonStyle(base, 2, 4), { bold: true });
assert.deepEqual(commonStyle(base, 1, 4), {});
// 光标处插入沿用前一个字的样式
assert.equal(serializeInline(replaceText(base, 4, 4, '的')), '负责**核心的**模块');
assert.equal(serializeInline(replaceText(base, 0, 6, '重写')), '重写');
// 新格式边界：零字距是显式设置，不应被真假值判断丢掉。
assert.equal(md('{{spacing=-0.5}}紧{{/spacing}}'), '<span data-fmt style="letter-spacing:-0.5pt">紧</span>');
assert.deepEqual(commonStyle(parseInline('{{spacing=0}}零{{/spacing}}'), 0, 1), { spacing: 0 });
assert.equal(plainText('{{spacing=11}}越界{{/spacing}}'), '{{spacing=11}}越界{{/spacing}}');
assert.equal(plainText('{{spacing=-3}}越界{{/spacing}}'), '{{spacing=-3}}越界{{/spacing}}');
assert.ok(md('{{font=calibri}}{{size=13.5}}ABC{{/size}}{{/font}}').includes('Calibri'));
assert.equal(serializeInline(clearStyle(parseInline('{{spacing=2}}{{font=aptos}}AB{{/font}}{{/spacing}}'), 0, 1)), 'A{{font=aptos}}{{spacing=2}}B{{/font}}{{/spacing}}');
console.log('resume-text: all assertions passed');

// 段落属性与字符格式独立；字段内软换行仍属同一段。
{
  const source = '{{paragraph=6,8,1.75}}甲**乙**\n丙{{/paragraph}}';
  const runs = parseInline(source);
  assert.equal(plainText(source), '甲乙\n丙');
  assert.deepEqual(parseInline(serializeInline(runs)), runs);
  assert.ok(md(source).includes('padding-top:6pt;padding-bottom:8pt;line-height:1.75'));
  assert.ok(serializeInline(clearStyle(runs, 0, 4)).includes('{{paragraph=6,8,1.75}}'));
  assert.equal(plainText('{{paragraph=-1,8,1}}甲{{/paragraph}}'), '{{paragraph=-1,8,1}}甲{{/paragraph}}');
}
