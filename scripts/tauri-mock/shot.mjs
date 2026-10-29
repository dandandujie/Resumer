// 用法：BASE=http://127.0.0.1:5174 node scripts/tauri-mock/shot.mjs /tmp/shots /zh/knowledge
// 动作：click=text:看板、select=css:[contenteditable]|0|3、key=Meta+b、assert=JS 表达式。
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { launchBrowser, delay } from './browser.mjs';

const [outDir = '/tmp/resumer-shots', ...routes] = process.argv.slice(2);
mkdirSync(outDir, { recursive:true });
const browser = await launchBrowser({ width:Number(process.env.W || 1440), height:Number(process.env.H || 900) });
let failed = false;
try {
  for (const route of routes) {
    const [pathname, ...hash] = route.split('#');
    const name = pathname.replace(/[^a-z0-9]+/gi,'_') + '-' + createHash('sha256').update(route).digest('hex').slice(0,8);
    try {
      await browser.navigate(`${process.env.BASE || 'http://localhost:5173'}${pathname}`);
      for (const action of hash.join('#').split('&').filter(Boolean)) {
        const cut = action.indexOf('=');
        const kind = action.slice(0,cut), value = action.slice(cut+1);
        if (kind === 'click') await browser.click(value);
        else if (kind === 'select') { const [selector,start,end] = value.replace(/^css:/,'').split('|'); await browser.select(selector,Number(start),Number(end)); }
        else if (kind === 'wait') await delay(Number(value));
        else if (kind === 'key') await browser.key(value);
        else if (kind === 'enter') await browser.key('Enter');
        else if (kind === 'focus') await browser.evaluate(`document.querySelector(${JSON.stringify(value.replace(/^css:/,''))}).focus()`);
        else if (kind === 'text') await browser.send('Input.insertText',{text:value});
        else if (kind === 'type') {
          const [selector,text] = value.replace(/^css:/,'').split('|');
          await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
          await browser.send('Input.insertText',{text});
        } else if (kind === 'ime') {
          const [text,commit] = value.split('|');
          await browser.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
          await browser.send('Input.insertText',{text:commit});
        } else if (kind === 'eval') console.log(await browser.evaluate(value));
        else if (kind === 'assert') {
          if (!await browser.evaluate(value)) throw new Error(`断言失败: ${value}`);
        } else throw new Error(`未知动作: ${kind}`);
      }
      if (browser.errors.length) throw new Error(browser.errors.join('\n'));
      console.log(`PASS ${route}`);
    } catch (error) { failed=true; console.error(`FAIL ${route}\n${error.message}`); }
    await browser.screenshot(path.join(outDir,`${name}.png`));
  }
} finally { await browser.close(); }
if (failed) process.exitCode=1;
