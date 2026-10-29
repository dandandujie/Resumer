import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  CJK_FONTS,
  LATIN_FONTS,
  cjkOfficeFontNames,
  matchPreset,
  resolveExportFontStack,
  resolveOfficeFonts,
  resolveScreenFontStack,
  resolveTheme,
  THEME_PRESETS,
} from '../src/lib/theme-config';

// 旧配对方案 / 旧 fontFamily 迁移到 中文字体 + 西文字体
assert.deepEqual(
  (({ fontScheme, latinFont }) => ({ fontScheme, latinFont }))(resolveTheme({ fontScheme: 'latin-arial' as never })),
  { fontScheme: 'yahei', latinFont: 'arial' },
);
assert.equal(resolveTheme({ fontFamily: 'Georgia' }).fontScheme, 'songti');
assert.equal(resolveTheme({ fontFamily: 'Georgia' }).latinFont, 'times');
assert.equal(resolveTheme({ fontScheme: 'garbage' as never }).fontScheme, DEFAULT_THEME.fontScheme);
assert.equal(resolveTheme({ fontScheme: 'sourcehan-serif' }).latinFont, 'times');
assert.equal(resolveTheme({ fontScheme: 'stzhongsong', latinFont: 'aptos' }).latinFont, 'aptos');

// 西文字体在前、中文字体在后，内置字体兜底
const stack = resolveScreenFontStack({ fontScheme: 'yahei', latinFont: 'calibri' });
assert.ok(stack.indexOf('Calibri') < stack.indexOf('Microsoft YaHei'), stack);
assert.ok(stack.includes('Reseumer Hei'));
assert.ok(resolveExportFontStack({ fontScheme: 'songti', latinFont: 'times' }).includes('Reseumer Song'));
assert.deepEqual(resolveOfficeFonts({ fontScheme: 'stzhongsong', latinFont: 'aptos' }), { eastAsia: '华文中宋', latin: 'Aptos' });
assert.equal(cjkOfficeFontNames()['sourcehan-sans'], 'Noto Sans SC');

// 页边距：无标记按 px 迁移，有标记按 mm
assert.equal(resolveTheme({ margin: { top: 20, right: 20, bottom: 20, left: 20 } }).margin.top, 5.3);
assert.equal(resolveTheme({ marginUnit: 'mm', margin: { top: 20, right: 20, bottom: 20, left: 20 } }).margin.top, 20);
assert.equal(resolveTheme().marginUnit, 'mm');

assert.deepEqual(Object.keys(THEME_PRESETS), ['standard']);
assert.equal(matchPreset(resolveTheme({ ...DEFAULT_THEME, fontFamily: 'legacy' })), 'standard');
// 预设是完整主题且能被识别
for (const [id, preset] of Object.entries(THEME_PRESETS)) {
  assert.equal(matchPreset(resolveTheme(preset)), id, `preset ${id} 应能被 matchPreset 识别`);
}
console.log('theme-config: 15 assertions passed');

// 每种主题组合均不能在导出阶段更换字体优先级。
for (const fontScheme of Object.keys(CJK_FONTS) as (keyof typeof CJK_FONTS)[]) {
  for (const latinFont of Object.keys(LATIN_FONTS) as (keyof typeof LATIN_FONTS)[]) {
    const theme = { fontScheme, latinFont };
    assert.equal(resolveExportFontStack(theme), resolveScreenFontStack(theme));
  }
}
