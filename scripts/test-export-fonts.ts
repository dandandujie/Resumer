import assert from 'node:assert/strict';
import { resolveAvailableFont } from '../src/lib/export/fonts';

async function main() {
  const stack = "'Microsoft YaHei', 'PingFang SC', 'Reseumer Hei'";
  assert.equal(await resolveAvailableFont(stack, '微软雅黑', async name => name === 'PingFang SC'), 'PingFang SC');
  assert.equal(await resolveAvailableFont(stack, '微软雅黑', async () => false), 'Noto Sans SC');
  assert.equal(await resolveAvailableFont(stack, '微软雅黑', async () => true), 'Microsoft YaHei');
  assert.equal(await resolveAvailableFont("'Reseumer Song', 'SimSun'", '宋体', async () => true), 'Noto Serif CJK SC');
  console.log('导出字体：保留已安装的首选字体，并匹配预览的实际回退字体');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
