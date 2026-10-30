import assert from 'node:assert/strict';
import {launchBrowser,delay} from './browser.mjs';
const b=await launchBrowser();const {evaluate,click,waitFor}=b;let checks=0;
const check=async(expr,label)=>{assert.equal(await evaluate(expr),true,label);checks++;};
try {
 await b.navigate((process.env.BASE||'http://127.0.0.1:5174')+'/zh/editor/r-demo');
 await evaluate(`(async()=>{
 const reactModule=await window.__appModule('/node_modules/.vite/deps/react.js');const React=reactModule.default||reactModule;const domModule=await window.__appModule('/node_modules/.vite/deps/react-dom_client.js');const ReactDOM=domModule.default||domModule;
 const module=await window.__appModule('/src/components/ai/ai-proposal-card.tsx');window.__resume=(await window.__appModule('/src/stores/resume-store.ts')).useResumeStore;window.__proposals=(await window.__appModule('/src/stores/proposals-store.ts')).useProposalsStore;
 const before=structuredClone(window.__resume.getState().sections);const after=structuredClone(before);after.find(s=>s.id==='s-sum').content.text='AI采纳后的工作稿';
 window.__p={id:'proposal-test',resumeId:'r-demo',toolCallId:'t1',toolName:'rewriteText',beforeSections:before,afterSections:after,createdAt:Date.now()};window.__proposals.getState().addProposal(window.__p);
 const div=document.createElement('div');div.id='policy-harness';div.style='position:fixed;inset:0 auto auto 0;z-index:1000;background:white;padding:20px';document.body.appendChild(div);window.__harness=ReactDOM.createRoot(div);
 function Harness(){const actions=module.useProposalActions(window.__p);return React.createElement(React.Fragment,null,React.createElement('button',{id:'policy-accept',onClick:actions.handleAccept},'采纳提案测试'),React.createElement('button',{id:'policy-reject',onClick:actions.handleReject},'拒绝提案测试'));}
 window.__renderHarness=()=>window.__harness.render(React.createElement(Harness));window.__renderHarness();
})()`);
 await waitFor("!!document.querySelector('#policy-accept')");
 await check("window.__TAURI_MOCK__.resumes['r-demo'].sections.find(s=>s.id==='s-sum').content.text!=='AI采纳后的工作稿'",'提案展示不写正式简历');
 await click('#policy-accept');await check("window.__resume.getState().sections.find(s=>s.id==='s-sum').content.text==='AI采纳后的工作稿' && window.__resume.getState().isDirty",'采纳修改工作稿并标记未保存');
 await delay(900);await check("window.__TAURI_MOCK__.resumes['r-demo'].sections.find(s=>s.id==='s-sum').content.text!=='AI采纳后的工作稿'",'默认手动保存时采纳后也不自动写盘');
 await evaluate('window.__resume.getState().flushPendingSave()');await check("window.__TAURI_MOCK__.resumes['r-demo'].sections.find(s=>s.id==='s-sum').content.text==='AI采纳后的工作稿'",'显式保存后提案才持久化');
 await evaluate(`(()=>{const before=structuredClone(window.__resume.getState().sections);const after=structuredClone(before);after.find(s=>s.id==='s-sum').content.text='不应覆盖';window.__p={...window.__p,id:'conflict',beforeSections:before,afterSections:after};window.__proposals.getState().addProposal(window.__p);window.__resume.getState().updateSection('s-sum',{text:'用户后来输入'});window.__renderHarness();})()`);
 await click('#policy-accept');await check("window.__resume.getState().sections.find(s=>s.id==='s-sum').content.text==='用户后来输入'",'过时提案不覆盖用户新编辑');
 await click('#policy-reject');await check("window.__resume.getState().sections.find(s=>s.id==='s-sum').content.text==='用户后来输入' && window.__TAURI_MOCK__.resumes['r-demo'].sections.find(s=>s.id==='s-sum').content.text==='AI采纳后的工作稿'",'拒绝不回滚用户编辑也不写数据库');
 await evaluate("window.__harness.unmount();document.querySelector('#policy-harness').remove()");assert.deepEqual(b.errors,[]);console.log(`PASS AI 提案 / 手动保存 / 冲突保护 ${checks} 项`);
}finally{await b.close();}
