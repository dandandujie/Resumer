// 独立临时浏览器：不接管用户会话；协议错误、页面异常与断言失败均交给调用者处理。
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchBrowser({ width = 1440, height = 900, hideScrollbars = false } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), 'resumer-browser-'));
  const chrome = process.env.CHROME || path.join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell');
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', ...(hideScrollbars ? ['--hide-scrollbars'] : []), 'about:blank'], { stdio: 'ignore' });
  let spawnError;
  proc.on('error', (error) => { spawnError = error; });
  let ws;
  const pending = new Map();
  const close = async () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('浏览器已关闭'));
    }
    pending.clear();
    ws?.close();
    if (proc.exitCode === null) {
      const stopped = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill();
      await Promise.race([stopped, delay(1000)]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !existsSync(portFile); i++) {
      if (spawnError) throw spawnError;
      if (proc.exitCode !== null || i >= 100) throw new Error('Chromium 启动失败或超时');
      await delay(100);
    }
    const port = readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
    const page = targets.find((target) => target.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const errors = [];
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); }, 12000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    };
    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result?.value;
    };
    const waitFor = async (expression) => {
      for (let i = 0; i < 80; i++) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`等待页面条件超时: ${expression}`);
    };
    const click = async (selector) => {
      let point;
      // 抽屉进出场期间命中点会移动；等待真实可点击，再发送原生鼠标事件。
      for (let attempt = 0; attempt < 30; attempt++) {
        point = await evaluate(`(() => {
        const target = ${JSON.stringify(selector)};
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const candidates = target.startsWith('text:')
          ? [...document.querySelectorAll('button,a,[role=tab],[role=menuitem],label')].filter(el => el.textContent.trim() === target.slice(5))
          : [...document.querySelectorAll(target.replace(/^css:/, ''))];
        const el = candidates.find(visible);
        if (!el) throw new Error('点击目标未找到: ' + target);
        if (el.disabled) throw new Error('点击目标被禁用: ' + target);
        el.scrollIntoView({block:'nearest',inline:'nearest'});
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) return null;
        if (el.getAnimations({subtree:false}).some(animation => animation.playState==='running')) return null;
        for (let parent=el.parentElement; parent; parent=parent.parentElement) {
          if (parent.getAnimations().some(animation => animation.playState==='running')) return null;
        }
        return {x,y};
      })()`);
        if (point) break;
        await delay(100);
      }
      if (!point) throw new Error(`点击目标被遮挡: ${selector}`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      await delay(100);
    };
    const select = async (selector, start, end) => {
      await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('选区目标未找到');
        el.scrollIntoView({block:'center'}); el.focus();
        if (el.setSelectionRange) { el.setSelectionRange(${start}, ${end}); el.dispatchEvent(new Event('select',{bubbles:true})); return; }
        const point = offset => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) { const node=walker.currentNode; if (offset <= node.length) return [node,offset]; offset-=node.length; }
          if (!el.textContent && offset===0) return [el,0];
          throw new Error('选区偏移越界');
        };
        const range = document.createRange(); range.setStart(...point(${start})); range.setEnd(...point(${end}));
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      })()`);
      await delay(100);
    };
    const key = async (chord) => {
      const parts = chord.split('+');
      const key = parts.pop();
      const modifiers = parts.reduce((n,p) => n | ({Meta:4,Shift:8,Ctrl:2,Alt:1}[p] || 0), 0);
      const codes = { Enter:13, Backspace:8, Delete:46, Tab:9, Escape:27, ArrowLeft:37, ArrowRight:39, ArrowUp:38, ArrowDown:40 };
      const params = { key, modifiers, code: key.length===1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: codes[key] || key.toUpperCase().charCodeAt(0) };
      if ((modifiers & 6) && key.toLowerCase() === 'a') params.commands = ['selectAll'];
      await send('Input.dispatchKeyEvent', { type:'keyDown', ...params, ...(key==='Enter' ? {text:'\r'} : {}) });
      await send('Input.dispatchKeyEvent', { type:'keyUp', ...params });
      await delay(100);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      performance.setResourceTimingBufferSize(5000);
      // Vite 的热更新时间戳属于模块身份；复用页面真正加载的 URL，避免测试创建第二份 store。
      window.__appModule = async (pathname) => {
        const url = performance.getEntriesByType('resource').map(entry => entry.name).findLast(name => new URL(name).pathname === pathname);
        if (!url) throw new Error('页面尚未加载模块: ' + pathname);
        return import(url);
      };
    ` });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false });
    return { send, evaluate, waitFor, click, select, key, errors, close,
      async navigate(url) { errors.length=0; await send('Page.navigate',{url}); await waitFor("document.getElementById('root')?.textContent.length > 30"); await delay(400); },
      async screenshot(file) { const shot = await send('Page.captureScreenshot',{format:'png'}); writeFileSync(file,Buffer.from(shot.data,'base64')); },
    };
  } catch (error) { await close(); throw error; }
}
