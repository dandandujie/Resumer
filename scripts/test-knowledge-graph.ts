import assert from 'node:assert/strict';
import { normalizeCompany } from '../src/lib/knowledge-graph';

assert.equal(normalizeCompany('北京 字节跳动科技有限公司'), '北京字节跳动');
assert.equal(normalizeCompany('星河股份集团'), '星河');
assert.equal(normalizeCompany('ACME 公司'), 'acme');
console.log('knowledge graph assertions passed');
