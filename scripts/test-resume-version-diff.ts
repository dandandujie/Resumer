import assert from 'node:assert/strict';
import type { Resume } from '../src/types/resume';
import { compareResumeVersions } from '../src/lib/resume-version-diff';
const source = {
  id:'r',title:'简历',template:'classic',language:'zh',themeConfig:{},
  sections:[{id:'s',title:'工作经历',type:'work_experience',sortOrder:0,visible:true,content:{items:[{id:'i',company:'公司 A',position:'工程师'}]}}],
} as unknown as Resume;
const updated = (value: object) => ({...structuredClone(source),...value});
assert.deepEqual(compareResumeVersions(source,updated({updatedAt:new Date(),userId:'other'})),[],'接口时间戳不属于内容变更');
const changed=updated({});(changed.sections[0].content as any).items[0].company='公司 B';
const changes=compareResumeVersions(source,changed);
assert.equal(changes.length,1);assert.match(changes[0].before,/公司 A/);assert.match(changes[0].after,/公司 B/);
const formatted=updated({});(formatted.sections[0].content as any).items[0].company='**公司 A**';
assert.equal(compareResumeVersions(source,formatted)[0].kind,'format','相同文字的局部格式不可漏报');
assert.equal(compareResumeVersions(source,updated({sections:[]}))[0].kind,'removed');
assert.equal(compareResumeVersions(updated({sections:[]}),source)[0].kind,'added');
const hidden=updated({});hidden.sections[0].visible=false;
assert.equal(compareResumeVersions(source,hidden)[0].kind,'visibility');
assert.equal(compareResumeVersions(source,updated({title:'投递版'}))[0].kind,'title');
assert.equal(compareResumeVersions(source,updated({themeConfig:{fontSize:'large'}}))[0].kind,'theme');
console.log('版本对比：内容、富文本、增减、显示状态、元数据与排版断言通过');
