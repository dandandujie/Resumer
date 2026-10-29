import assert from 'node:assert/strict';
import { normalizeResumeData } from '../src/lib/resume-api-data';

const seconds = 1791000000;
const row = { id: 'time-test', createdAt: seconds, updatedAt: seconds + 1 };
const resume = normalizeResumeData({ ...row, sections: [row] });
assert.equal(resume.createdAt.getUTCFullYear(), 2026);
assert.equal(resume.updatedAt.getTime(), (seconds + 1) * 1000);
assert.equal(resume.sections[0].createdAt.getTime(), seconds * 1000);
assert.equal(normalizeResumeData(resume).updatedAt.getTime(), resume.updatedAt.getTime());
assert.equal(normalizeResumeData({ ...row, updatedAt: seconds * 1000 }).updatedAt.getTime(), seconds * 1000);
assert.equal(normalizeResumeData({ ...row, updatedAt: '2026-10-03T00:00:00Z' }).updatedAt.toISOString(), '2026-10-03T00:00:00.000Z');
console.log('PASS 简历接口时间：Unix 秒、毫秒、序列化日期及重复读取');
