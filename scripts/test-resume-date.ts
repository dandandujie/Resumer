import assert from 'node:assert/strict';
import { formatDateRange, formatMonth, normalizeMonth } from '../src/lib/resume-date';

assert.equal(normalizeMonth('2022.7'), '2022-07');
assert.equal(normalizeMonth('2022-07'), '2022-07');
assert.equal(normalizeMonth('2022/07'), '2022-07');
assert.equal(normalizeMonth('2022年7月'), '2022-07');
assert.equal(normalizeMonth('202207'), '2022-07');
assert.equal(normalizeMonth('2022.13'), '');
assert.equal(formatMonth('2022-07', 'dot'), '2022.07');
assert.equal(formatMonth('2022-07', 'cn'), '2022年7月');
assert.equal(formatDateRange('2022.07', '2024.06', { lang: 'zh' }), '2022.07 - 2024.06');
assert.equal(formatDateRange('2022-07', '', { current: true, lang: 'zh' }), '2022.07 - 至今');
console.log('resume-date: 9 assertions passed');
