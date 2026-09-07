import assert from 'node:assert/strict';
import { formatDateRange, formatMonth, normalizeMonth, normalizeResumeDates } from '../src/lib/resume-date';

// 与 src-tauri/src/export/date.rs 的用例逐条相同，两侧必须同步修改。
const NORMALIZE_CASES: [string, string][] = [
  ['2022.7', '2022-07'],
  ['2022-07', '2022-07'],
  ['2022/07', '2022-07'],
  ['2022年7月', '2022-07'],
  ['202207', '2022-07'],
  ['2022-07-15', '2022-07'],
  ['2022.07.15', '2022-07'],
  ['2022年7月15日', '2022-07'],
  ['Jul 2022', '2022-07'],
  ['July 2022', '2022-07'],
  ['Sept. 2022', '2022-09'],
  ['07/2022', '2022-07'],
  ['2022.13', ''],
  ['2023', ''],
  ['至今', ''],
  ['', ''],
];
for (const [input, expected] of NORMALIZE_CASES) {
  assert.equal(normalizeMonth(input), expected, `normalizeMonth(${input})`);
}

assert.equal(formatMonth('2022-07', 'dot'), '2022.07');
assert.equal(formatMonth('2022-07', 'dash'), '2022-07');
assert.equal(formatMonth('2022-07', 'cn'), '2022年7月');
assert.equal(formatMonth('2022-07', 'cn', 'en'), '2022.07');
// 无法归一化的值原样显示，不得清空
assert.equal(formatMonth('2023', 'dot'), '2023');
assert.equal(formatMonth(' Summer 2022 ', 'dot'), 'Summer 2022');

assert.equal(formatDateRange('2022.07', '2024.06', { lang: 'zh' }), '2022.07 - 2024.06');
assert.equal(formatDateRange('2022-07', '', { current: true, lang: 'zh' }), '2022.07 - 至今');
assert.equal(formatDateRange('2022-07', null, { lang: 'en' }), '2022.07 - Present');
assert.equal(formatDateRange('', '', { lang: 'zh' }), '');
assert.equal(formatDateRange('2023', '', { current: true, lang: 'zh' }), '2023 - 至今');
assert.equal(formatDateRange('2022-07', '2024-06', { style: 'cn', lang: 'zh' }), '2022年7月 - 2024年6月');

// 递归归一化：能转的转，转不了的保留
const normalized = normalizeResumeDates({
  sections: [{ content: { items: [{ startDate: '2022.7', endDate: null, date: '2023', title: 'x' }] } }],
});
assert.deepEqual(normalized.sections[0].content.items[0], {
  startDate: '2022-07',
  endDate: null,
  date: '2023',
  title: 'x',
});

console.log(`resume-date: ${NORMALIZE_CASES.length + 14} assertions passed`);
