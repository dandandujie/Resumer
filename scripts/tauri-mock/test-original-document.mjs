// DOCX 原文档验收：真实键盘、无改动保真、保存回读、错误重试、段落属性与 ZIP 部件。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launchBrowser, delay } from './browser.mjs';
const origin = process.env.MOCK_ORIGIN || 'http://127.0.0.1:5174';
const out = '/tmp/resumer-original-document-tests';
mkdirSync(out, { recursive:true });
const original = readFileSync(new URL('../fixtures/original-document.docx', import.meta.url));
const browser = await launchBrowser();
const priorErrors = [];
const navigate = browser.navigate.bind(browser);
browser.navigate = async (url) => { priorErrors.push(...browser.errors); await navigate(url); };
if (process.env.MOCK_BUILD === '1') {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(new URL('./index.js', import.meta.url), 'utf8') });
}
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS',label); };
try {
  await browser.navigate(`${origin}/zh/dashboard`);
  // 走用户真实导入按钮和文件 input；测试文件只含虚构人物与生成的色块头像。
  await browser.click('text:导入文件');
  await browser.evaluate(`(() => {
    const input=document.querySelector('input[type=file]');
    const transfer=new DataTransfer();
    transfer.items.add(new File([new Uint8Array(${JSON.stringify([...original])})], '原文档验收.docx', {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await browser.click('text:导入');
  await browser.waitFor(`location.pathname.includes('/editor/') && document.querySelector('[role=status]')?.textContent==='已保存到本机'`);
  const id = await browser.evaluate('location.pathname.split("/").pop()');
  check(await browser.evaluate(`window.__TAURI_MOCK__.resumes['${id}'].template === 'original-docx'`),'DOCX 导入进入原文档模式');
  check(await browser.evaluate("document.querySelectorAll('.docx-page').length===2 && document.body.innerText.includes('原始页眉') && document.body.innerText.includes('原始页脚')"),'原分页和页眉页脚呈现');
  await browser.click('text:DOCX');
  const untouched = await browser.evaluate('window.__TAURI_MOCK__.exportedDocument.bytes');
  check(Buffer.from(untouched).equals(original),'未编辑导出逐字节等于原文件');
  const clickDateEnd = async () => {
    const paragraphId=await browser.evaluate(`([...document.querySelectorAll('.docx-paragraph-fragment')].find(e=>e.textContent.startsWith('Editable date'))).dataset.paragraphId`);
    await browser.click(`.docx-paragraph-fragment[data-paragraph-id=${JSON.stringify(paragraphId)}] .layout-run:last-child`);
    await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
    await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});
  };
  await clickDateEnd();
  for(let i=0;i<10;i++) await browser.key('Backspace');
  await browser.send('Input.insertText',{text:'2026-10-02'});
  await browser.click('text:保存');
  await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  const edited=await browser.evaluate(`window.__TAURI_MOCK__.documents['${id}'].bytes`);
  writeFileSync(`${out}/edited.docx`,Buffer.from(edited));
  await browser.navigate(`${origin}/zh/editor/${id}`);
  await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  check(await browser.evaluate("document.body.textContent.includes('Editable date: 2026-10-02')"),'重新打开读取已保存的实际 DOCX');
  await clickDateEnd();
  for(let i=0;i<10;i++) await browser.key('Shift+ArrowLeft');
  await browser.click('[aria-label^="加粗("]');
  await delay(200);
  for(const [label,value] of [['段前','6'],['段后','8'],['字距','0.5']]) {
    await browser.click(`input[aria-label="${label}"]`);
    await browser.send('Input.insertText',{text:value});
  }
  await browser.click('text:应用间距');
  await browser.waitFor("document.body.innerText.includes('间距已更新')");
  await browser.click('text:保存');
  await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  writeFileSync(`${out}/formatted.docx`,Buffer.from(await browser.evaluate(`window.__TAURI_MOCK__.documents['${id}'].bytes`)));
  check(true,'选区字距、段前段后真实应用');
  // 失败注入只替换隔离 mock 的写入，不绕过编辑器保存逻辑。
  await browser.evaluate(`window.__originalInvoke=window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke=async function(cmd,args){if(cmd==='save_original_docx')throw new Error('模拟磁盘写入失败'); return window.__originalInvoke.call(this,cmd,args);}`);
  await clickDateEnd();
  await browser.send('Input.insertText',{text:' 保存重试'});
  await browser.click('text:保存');
  await browser.waitFor("document.querySelector('[role=status]')?.textContent.includes('保存失败')");
  check(await browser.evaluate("document.body.innerText.includes('保存重试')"),'保存失败仍保留当前编辑');
  await browser.click('[aria-label="返回工作台"]');
  check(await browser.evaluate(`location.pathname.endsWith('/editor/${id}')`),'保存失败时返回操作不会丢弃文档');
  await browser.click('text:另存当前副本');
  const rescued = await browser.evaluate('window.__TAURI_MOCK__.exportedDocument.bytes');
  writeFileSync(`${out}/rescued.docx`, Buffer.from(rescued));
  const rescuedText = execFileSync('python3', ['-c', 'import sys,zipfile,xml.etree.ElementTree as E; print("".join(E.fromstring(zipfile.ZipFile(sys.argv[1]).read("word/document.xml")).itertext()))', `${out}/rescued.docx`], { encoding: 'utf8' });
  check(rescuedText.includes('保存重试'),'数据库保存失败仍可另存包含最后输入的副本');
  await browser.evaluate('window.__TAURI_INTERNALS__.invoke=window.__originalInvoke');
  await browser.click('text:保存');
  await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  await browser.navigate(`${origin}/zh/editor/${id}`);
  await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  check(await browser.evaluate("document.body.innerText.includes('保存重试')"),'失败重试后持久化回读');
  await browser.click('text:历史版本');
  await browser.waitFor("document.querySelectorAll('[data-resume-version]').length>1");
  const earliest = await browser.evaluate("[...document.querySelectorAll('[data-resume-version]')].at(-1).dataset.resumeVersion");
  await browser.click(`[data-resume-version="${earliest}"]`);
  await browser.waitFor("document.querySelector('[role=dialog] [data-original-document]')?.textContent.includes('2026-09-01')");
  check(await browser.evaluate("!document.querySelector('[role=dialog] [data-original-document] [contenteditable=true]')"),'历史文档只读且读取原始日期');
  await browser.click('[role=dialog] button:has(svg.lucide-rotate-ccw)');
  await browser.waitFor("!!document.querySelector('[role=alertdialog]')");
  await browser.click('[role=alertdialog] button:last-child');
  await browser.waitFor("!document.querySelector('[role=dialog]') && document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  check(await browser.evaluate("document.querySelector('[data-original-document]').textContent.includes('2026-09-01') && !document.querySelector('[data-original-document]').textContent.includes('保存重试')"),'恢复历史版本后重新挂载原文件');
  await clickDateEnd();
  await browser.send('Input.insertText',{text:' 返回保存'});
  await browser.waitFor("document.querySelector('[data-original-document]').textContent.includes('返回保存')");
  await browser.click('[aria-label="返回工作台"]');
  await browser.waitFor("location.pathname.endsWith('/dashboard')");
  await browser.navigate(`${origin}/zh/editor/${id}`);
  await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机'");
  check(await browser.evaluate("document.querySelector('[data-original-document]').textContent.includes('返回保存')"),'返回工作台等待最后输入落库');
  check((await browser.evaluate("performance.getEntriesByType('resource').map(e=>e.name).filter(n=>!n.startsWith(location.origin))")).length===0,'原文档加载和编辑无外部请求');
  await browser.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  await delay(350);
  check(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth'),'900px 窗口无页面横向溢出');
  await browser.screenshot(`${out}/editor-900.png`);
  execFileSync('python3',['scripts/verify-original-document.py',`${out}/edited.docx`,`${out}/formatted.docx`],{stdio:'inherit'});
  if (process.env.OFFICE_ROUNDTRIP) {
    const office = readFileSync(process.env.OFFICE_ROUNDTRIP);
    await browser.navigate(`${origin}/zh/dashboard`);
    await browser.click('text:导入文件');
    await browser.evaluate(`(() => {
      const input=document.querySelector('input[type=file]'); const transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(${JSON.stringify([...office])})], 'Word回读验收.docx'));
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await browser.click('text:导入');
    await browser.waitFor("document.querySelector('[role=status]')?.textContent==='已保存到本机' && document.querySelector('[data-original-document]')?.textContent.includes('2026-10-03')");
    await browser.waitFor("document.querySelector('[data-original-document] img')?.naturalWidth > 0");
    check(await browser.evaluate("document.querySelectorAll('.docx-page').length===2 && !!document.querySelector('[data-original-document] img')"),'Word 修改并保存的 DOCX 能重新导入，日期、两页和头像保留');
  }
  const errors = [...priorErrors, ...browser.errors];
  check(errors.length===0,`整个流程无浏览器异常: ${errors.join('\n')}`);
  console.log(`通过 ${checks} 项原文档交互检查与 OOXML 保真检查。`);
} catch (error) {
  await browser.screenshot(`${out}/failure.png`);
  writeFileSync(`${out}/failure.html`, await browser.evaluate('document.documentElement.outerHTML'));
  console.error(browser.errors);
  console.error(await browser.evaluate("performance.getEntriesByType('resource').filter(e=>/ttf|otf|wasm/.test(e.name)).map(e=>({name:e.name,size:e.decodedBodySize}))"));
  throw error;
} finally { await browser.close(); }
