import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
const b=await launchBrowser({width:1200,height:850});
const {evaluate,click,key,send,waitFor}=b;
const base=process.env.BASE||'http://127.0.0.1:5175';let checks=0;
const check=async(expr,label)=>{assert.equal(await evaluate(expr),true,label);checks++;};
const fill=async(selector,text)=>{await click(selector);await key('Meta+a');await send('Input.insertText',{text});};
const choose=async(selector,index)=>{await click(selector);await key('Home');for(let n=0;n<index;n++)await key('ArrowDown');await key('Enter');};
async function create(company,position){await click('text:开始一段经历');await fill('form .grid > label:nth-child(1) input',company);await fill('form .grid > label:nth-child(2) input',position);await click('text:开始记录');await waitFor('!!document.querySelector("#work-note-body")');}
try {
 await b.navigate(base+'/zh/work-notes?no_experiences=1');
 await waitFor("document.body.textContent.includes('添加我的第一段经历')");
 await check("!document.querySelector('#work-note-body')",'无经历时不要求用户写独立日记');
 await create('星河科技','产品实习');
 await check("document.querySelector('section[aria-label=随手记一段] summary').textContent.includes('星河科技 · 产品实习')",'新经历的记录选项显示固定归属');
 await fill('#work-note-body','星河项目的用户访谈，今天听到三位客户的反馈。');await click('text:记下了');
 await waitFor('window.__TAURI_MOCK__.workNotes.length===1');
 await check("window.__TAURI_MOCK__.workNotes[0].experienceId===window.__TAURI_MOCK__.experiences[0].id",'原话绑定稳定经历ID');
 await click('text:我的经历');await create('海岸科技','产品实习');
 await fill('#work-note-body','海岸项目做了需求评审。');await click('text:记下了');await waitFor('window.__TAURI_MOCK__.workNotes.length===2');
 await waitFor('document.querySelectorAll("[data-work-note]").length===1');
 await check("document.querySelector('[data-work-note]').textContent.includes('海岸')&&!document.querySelector('[data-work-note]').textContent.includes('星河')",'相同职位的不同公司记录严格隔离');
 await fill('#work-note-body','海岸未发送的草稿');await click('text:我的经历');
 await click('[data-work-experience]:first-child');await waitFor('!!document.querySelector("#work-note-body")');
 await check("document.querySelector('#work-note-body').value===''",'切换经历不串未发送草稿');
 await click('text:我的经历');
 await evaluate("(()=>{const note={id:crypto.randomUUID(),body:'归组前留下的完整原话',context:'旧自由标签',occurredOn:'2026-10-01',revision:0,analysis:null,createdAt:Date.now()/1000,experienceId:null};window.__TAURI_MOCK__.workNotes.push(note);sessionStorage.setItem('mock_work_notes',JSON.stringify(window.__TAURI_MOCK__.workNotes));window.dispatchEvent(new Event('work-notes-changed'));})()");
 await waitFor("document.querySelector('details summary')?.textContent.includes('待归组')");await click('details summary');
 await click('details input[type=checkbox]');await choose('[aria-label=将旧片段归入经历]',1);await click('text:确认归入这段经历');
 await waitFor("window.__TAURI_MOCK__.workNotes.find(n=>n.context==='旧自由标签').experienceId!==null");
 await check("window.__TAURI_MOCK__.workNotes.find(n=>n.context==='旧自由标签').body==='归组前留下的完整原话'",'旧原话手动归组后内容不变');
 await check("window.__TAURI_MOCK__.workNotes.find(n=>n.context==='旧自由标签').revision===1",'归组使旧来源快照过期');
 await check("!document.querySelector('details summary')?.textContent.includes('待归组')",'已归组片段移出待归组列表');
 assert.deepEqual(b.errors,[]);console.log(`PASS 经历生命周期 / 稳定归属 / 跨经历隔离 / 旧原话归组 ${checks} 项`);
}finally{await b.close();}
