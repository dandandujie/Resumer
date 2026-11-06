import assert from 'node:assert/strict';
import { defaultResumeWorkspaceTitle } from '../src/lib/resume-workspace-title';

assert.equal(defaultResumeWorkspaceTitle('基础简历', '数据分析实习'), '基础简历 · 数据分析实习');
assert.equal(defaultResumeWorkspaceTitle('  基础  ', '  面试\n交流  '), '基础 · 面试 交流');
const long = defaultResumeWorkspaceTitle('经'.repeat(200), '面向数据分析岗位');
assert.equal(Array.from(long).length, 200, '合法的最长基础名称仍能生成合法目标名称');
assert.ok(long.endsWith(' · 面向数据分析岗位'), '长基础名称不能挤掉用途');
const unicode = defaultResumeWorkspaceTitle('🎓'.repeat(200), '🚀'.repeat(30));
assert.equal(Array.from(unicode).length, 200);
assert.ok(unicode.endsWith(' · ' + '🚀'.repeat(24)), '需求截断保留完整非BMP字符');
assert.equal(unicode.isWellFormed(), true, '不产生孤立代理码元');
assert.equal(defaultResumeWorkspaceTitle('', ''), '简历');
console.log('PASS 定向稿默认名称：长度边界 / 用途保留 / Unicode安全');
