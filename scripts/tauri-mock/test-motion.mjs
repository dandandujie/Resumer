// Motion must never move modal anchoring, trap focus, or accelerate reduced-motion spinners.
import assert from 'node:assert/strict';
import { launchBrowser, delay } from './browser.mjs';
const b = await launchBrowser({ width: 1200, height: 850 });
const base = process.env.BASE || 'http://127.0.0.1:5186';
let checks = 0;
const check = async (expression, label) => { assert.equal(await b.evaluate(expression), true, label); checks++; };
try {
  await b.send('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'no-preference'}] });
  await b.navigate(base + '/zh/dashboard');
  const trigger = '.app-actions [data-variant="primary"]';
  for (let i = 0; i < 3; i++) {
    await b.click(trigger);
    await b.waitFor("!!document.querySelector('[data-slot=dialog-content]')");
    await check(`(() => {const el=document.querySelector('[data-slot=dialog-content]');const r=el.getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<2 && Math.abs(r.y+r.height/2-innerHeight/2)<5;})()`, 'modal stays centered during entrance');
    await b.key('Escape');
    await b.waitFor("!document.querySelector('[data-slot=dialog-overlay]')");
    await check(`document.activeElement===document.querySelector('${trigger}') && getComputedStyle(document.body).pointerEvents!=='none'`, 'dismiss restores focus and pointer interaction');
  }
  await b.send('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
  await b.click(trigger);
  await check("getComputedStyle(document.querySelector('[data-slot=dialog-content]')).animationName==='none'", 'reduced motion removes portal entrance');
  await b.key('Escape');
  // Infinite utility spinners occur across AI and loading tasks; isolate that primitive.
  await b.evaluate("(()=>{const el=document.createElement('span');el.id='motion-spinner-probe';el.className='animate-spin';document.body.append(el)})()");
  await check("getComputedStyle(document.querySelector('#motion-spinner-probe')).animationName==='none'", 'reduced motion stops infinite spinner instead of accelerating it');
  await check(`getComputedStyle(document.querySelector('${trigger}')).transitionDuration==='0s'`, 'reduced motion removes press transitions');
  await b.send('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'no-preference'}] });
  await delay(50);
  await check("getComputedStyle(document.querySelector('#motion-spinner-probe')).animationName!=='none'", 'live preference changes restore loading animation');
  await b.evaluate("document.querySelector('#motion-spinner-probe').remove()");
  await b.click(trigger);
  await check("getComputedStyle(document.querySelector('[data-slot=dialog-content]')).animationDuration==='0.16s'", 'live preference changes restore short entrance');
  await b.key('Escape');
  await b.navigate(base + '/zh/editor/r-demo');
  await b.click('button[aria-label="返回工作台"]');
  await b.waitFor("!!document.querySelector('.app-shell main')");
  await check("document.activeElement===document.querySelector('.app-shell main')", 'return from editor gives keyboard focus a task landmark');
  await b.key('Tab');
  await check("document.querySelector('.app-shell main').contains(document.activeElement) && document.activeElement.tagName==='BUTTON'", 'Tab continues into the current task');
  assert.deepEqual(b.errors, [], 'no runtime errors');
  console.log(`PASS motion: ${checks} checks`);
} finally { await b.close(); }
