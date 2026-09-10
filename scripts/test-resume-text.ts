import assert from 'node:assert/strict';
import { md, stripAllMarkers, stripSpanMarkers, hasSpanMarkers } from '../src/lib/resume-text';

// 与 src-tauri/src/export/inline.rs 的用例对齐：同一段标记，前端出 HTML，Rust 出 Run
assert.equal(md('**粗体** *斜体* __下划线__ `代码`'), '<strong>粗体</strong> <em>斜体</em> <u>下划线</u> <code>代码</code>');
assert.equal(md('{{color=#C00}}红{{/color}}'), '<span data-fmt style="color:#c00">红</span>');
assert.equal(md('{{size=12}}大{{/size}}'), '<span data-fmt style="font-size:12pt">大</span>');
assert.ok(md('{{font=songti}}宋{{/font}}').includes('font-family:') && md('{{font=songti}}宋{{/font}}').includes('SimSun'));
// 嵌套与组合
assert.equal(
  md('{{color=#c00}}{{size=14}}**重点**{{/size}}{{/color}}'),
  '<span data-fmt style="color:#c00"><span data-fmt style="font-size:14pt"><strong>重点</strong></span></span>',
);
// 非法值不生成样式但保留文本；未闭合按普通文本
assert.equal(md('{{color=red}}x{{/color}}'), 'x');
assert.equal(md('{{size=99}}x{{/size}}'), 'x');
assert.equal(md('{{color=#c00}}未闭合'), '{{color=#c00}}未闭合');
assert.equal(md('{{font=nope}}x{{/font}}'), 'x');
// HTML 转义先于标记
assert.equal(md('{{color=#c00}}<b>{{/color}}'), '<span data-fmt style="color:#c00">&lt;b&gt;</span>');

assert.equal(stripSpanMarkers('{{color=#c00}}红{{/color}} **粗**'), '红 **粗**');
assert.equal(stripAllMarkers('{{size=12}}**a**{{/size}} *b* __c__ `d`'), 'a b c d');
assert.equal(hasSpanMarkers('{{size=12}}a{{/size}}'), true);
assert.equal(hasSpanMarkers('**a**'), false);
console.log('resume-text: 14 assertions passed');
