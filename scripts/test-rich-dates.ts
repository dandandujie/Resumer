import assert from 'node:assert/strict';
import { formatMonth, normalizeMonth, normalizeResumeDates, restyleDate } from '../src/lib/resume-date';
import { parseInline, plainText } from '../src/lib/resume-text';
const date = '**2026**-{{color=#c00}}09{{/color}}';
assert.equal(normalizeMonth(date), '2026-09');
assert.equal(normalizeResumeDates({date}).date, date);
for (const [style, expected] of [['dot','2026.09'],['dash','2026-09'],['cn','2026年9月']] as const) {
  const rendered = formatMonth(date, style);
  assert.equal(plainText(rendered), expected);
  const runs = parseInline(rendered);
  assert.equal(runs[0].bold, true);
  assert.equal(runs.at(-1)?.color, '#c00');
}
assert.equal(plainText(restyleDate(date, '2027-10')), '2027-10');
assert.equal(plainText(formatMonth('**July** 2026', 'cn')), '2026年7月');
assert.equal(plainText(formatMonth('**2026**年9月', 'dash')), '2026-09');
assert.equal(formatMonth('Summer 2022', 'cn'), 'Summer 2022');
console.log('PASS 日期格式、局部样式和存储归一化');
