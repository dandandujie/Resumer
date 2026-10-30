import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { launchBrowser, delay } from "./browser.mjs";
const b = await launchBrowser({ width: 1440, height: 900 });
const { evaluate, click, key, send, waitFor } = b;
const base = process.env.BASE || "http://127.0.0.1:5174";
let checks = 0;
const check = async (expr, label) => {
  assert.equal(await evaluate(expr), true, label);
  checks++;
};
const fill = async (selector, text) => {
  await click(selector);
  await key("Meta+a");
  await send("Input.insertText", { text });
};
const addTag = async (label, text) => {
  await fill(`input[aria-label="${label}"]`, text);
  await key("Enter");
};
const openNote = async (path) => {
  await click(`[data-wiki-explorer] [data-knowledge-path="${path}"]`);
  await waitFor(
    `document.querySelector('[data-wiki-tab="${path}"]')?.getAttribute('aria-selected')==='true'`,
  );
  await waitFor(
    "!!document.querySelector('[data-wiki-note] article')||!!document.querySelector('[data-wiki-editor]')",
  );
};
mkdirSync("/tmp/resumer-wiki-tags/screenshots", { recursive: true });
try {
  await b.navigate(base + "/zh/knowledge?ai_review=1");
  await evaluate(
    `(async()=>{for(const [title,tags] of [['B项目',['前端','项目']],['C面试',['面试']],['D无标签',[]]])await window.__TAURI_INTERNALS__.invoke('library_put_collection',{title,purpose:'测试资料',tags,category:tags[0]||'',kind:'document',enabled:true});})()`,
  );
  await click("text:新建资料集");
  await evaluate(
    `(()=>{const data=new DataTransfer();data.items.add(new File(['缓存原始资料'],'A面试.md'));const input=document.querySelector('[data-library-import] input[type=file]');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await click("[data-library-import] details summary");
  await addTag("资料集标签", "前端");
  await addTag("资料集标签", "面试");
  await click('[role=switch][aria-label="导入后整理Wiki"]');
  await click("text:导入 1 个文件");
  await waitFor(
    "document.querySelector('[data-library-import] [data-slot=dialog-footer] button')?.textContent.includes('完成')&&!document.querySelector('[data-library-import] [data-slot=dialog-footer] button').disabled",
  );
  await click("[data-library-import] [data-slot=dialog-footer] button");
  await check(
    "window.__TAURI_MOCK__.libraryCollections.find(c=>c.title==='A面试').tags.length===2",
    "资料集可一次添加多个标签",
  );
  await click("[data-tag-filter] [role=combobox]");
  await click('[role=option]:has(span[title="前端"])');
  await click('[role=option]:has(span[title="面试"])');
  await check(
    "document.querySelectorAll('[role=option][aria-selected=true]').length===2",
    "标签筛选多选，选择后保持面板打开",
  );
  await check(
    "document.querySelectorAll('[data-collection-id]').length===1",
    "全部匹配返回交集",
  );
  await click("text:任一匹配");
  await check(
    "document.querySelectorAll('[data-collection-id]').length===3",
    "任一匹配返回并集",
  );
  await click("text:完成");
  await click("[data-tag-filter] .app-text-action");
  await click("[data-tag-filter] [role=combobox]");
  await click("[role=option]");
  await click("text:完成");
  await check(
    "document.querySelectorAll('[data-collection-id]').length===1&&document.querySelector('[data-collection-id]').textContent.includes('D无标签')",
    "未打标签独立筛选",
  );
  await click("[data-tag-filter] .app-text-action");
  const collection = await evaluate(
    "window.__TAURI_MOCK__.libraryCollections.find(c=>c.title==='A面试').id",
  );
  await click(`[data-collection-id="${collection}"]`);
  await click("text:编辑资料集");
  await addTag("资料集标签", "缓存");
  await click("text:保存设置");
  await waitFor("!document.querySelector('[role=dialog]')");
  await check(
    "window.__TAURI_MOCK__.libraryCollections.find(c=>c.title==='A面试').tags.length===3",
    "编辑标签保留旧标签并追加",
  );
  await click("text:求职 Wiki");
  await waitFor("!!document.querySelector('[data-wiki-note] article')");
  await check(
    "!document.querySelector('[data-wiki-panel]')&&!document.querySelector('[data-workspace-assistant=wiki]')",
    "阅读默认不被AI和辅助面板占用",
  );
  await check(
    "!!document.querySelector('[role=tree][aria-label=\"Wiki文件目录\"]')",
    "Wiki使用真实层级目录",
  );
  await openNote("wiki/companies/bytedance.md");
  await openNote("wiki/skills/react-performance.md");
  await check(
    "document.querySelectorAll('[data-wiki-tab]').length===3",
    "多笔记标签页保留打开上下文",
  );
  await click('[aria-label="Wiki后退"]');
  await check(
    "document.querySelector('[data-wiki-tab=\"wiki/companies/bytedance.md\"]').getAttribute('aria-selected')==='true'",
    "后退到此前笔记",
  );
  await click('[aria-label="Wiki前进"]');
  await check(
    "document.querySelector('[data-wiki-tab=\"wiki/skills/react-performance.md\"]').getAttribute('aria-selected')==='true'",
    "前进恢复笔记",
  );
  await click('[data-wiki-tab="wiki/skills/react-performance.md"]');
  await key("Alt+Shift+ArrowLeft");
  await check(
    "[...document.querySelectorAll('[data-wiki-tab]')][1].dataset.wikiTab==='wiki/skills/react-performance.md'",
    "标签页支持键盘调整顺序",
  );
  await click('[aria-label="收藏笔记"]');
  await click("[data-wiki-explorer] [role=tab]:nth-child(3)");
  await check(
    "document.querySelectorAll('.wiki-search-row').length===1",
    "收藏列表可直接找回笔记",
  );
  await click("[data-wiki-explorer] [role=tab]:nth-child(2)");
  await fill('input[aria-label="搜索Wiki笔记"]', "量化");
  await waitFor(
    "document.querySelector('.wiki-search-row mark')?.textContent==='量化'",
  );
  await check(
    "!document.querySelector('.wiki-search-row').textContent.includes('title:')",
    "全文命中展示去除frontmatter的上下文并高亮关键词",
  );
  await click(".wiki-search-row");
  await click("text:编辑");
  await fill(
    "textarea[data-wiki-editor]",
    "# 字节跳动\n\n## 测试章节\n一份需要保留的跨标签页草稿。",
  );
  await click('[aria-label="关闭笔记 字节跳动"]');
  await click(".wiki-search-row");
  await check(
    "document.querySelector('textarea[data-wiki-editor]').value.includes('跨标签页草稿')",
    "关闭标签后重新打开仍保留未保存草稿",
  );
  await click("text:保存");
  await waitFor("!!document.querySelector('[data-wiki-note] article')");
  await click("text:编辑");
  await fill("textarea[data-wiki-editor]", "# 字节跳动\n\n我的新草稿");
  await evaluate(
    "window.__TAURI_MOCK__.contents['wiki/companies/bytedance.md']='# 字节跳动\\n\\n外部编辑器的新内容'",
  );
  await click("text:保存");
  await waitFor("!!document.querySelector('[data-wiki-conflict]')");
  await check(
    "document.querySelector('[data-wiki-conflict]').textContent.includes('外部编辑器的新内容')&&document.querySelector('[data-wiki-conflict]').textContent.includes('我的新草稿')",
    "版本冲突显示磁盘与草稿，尚不覆盖",
  );
  await click("text:使用磁盘版本");
  await waitFor("!document.querySelector('[data-wiki-conflict]')");
  await click("text:阅读");
  await check(
    "document.querySelector('[data-wiki-note] article').textContent.includes('外部编辑器的新内容')",
    "用户选择后使用磁盘版本",
  );
  await click("[data-wiki-explorer] [role=tab]:first-child");
  await click('[aria-label="新建Wiki文件夹"]');
  await fill('input[aria-label="Wiki文件夹名称"]', "测试笔记集");
  await click("text:创建文件夹");
  await waitFor(
    "!!document.querySelector('[data-wiki-folder=\"wiki/guides/测试笔记集\"]')",
  );
  await click('[aria-label="新建Wiki笔记"]');
  await fill('input[aria-label="Wiki笔记名称"]', "我的复盘");
  await click("text:创建笔记");
  await waitFor("!!document.querySelector('textarea[data-wiki-editor]')");
  await fill(
    "textarea[data-wiki-editor]",
    "# 我的复盘\n\n## 准备重点\n总结 [[字节跳动]] 的准备重点。\n\n## 下一步\n复习项目。",
  );
  await click("text:保存");
  await waitFor("!!document.querySelector('[data-wiki-note] article')");
  await check(
    "document.querySelector('[data-wiki-note] h1').textContent==='我的复盘'",
    "文件夹内新建笔记并真实保存",
  );
  await click("[data-wiki-note] article .wiki-inline-link");
  await check(
    "document.querySelector('[data-wiki-tab=\"wiki/companies/bytedance.md\"]').getAttribute('aria-selected')==='true'",
    "标题式双链能解析到已有笔记",
  );
  await click('[data-wiki-tab="wiki/guides/测试笔记集/我的复盘.md"]');
  await click('[aria-label="编辑笔记属性"]');
  await fill('input[aria-label="Wiki笔记标题"]', "复盘洞察");
  await addTag("Wiki笔记标签", "前端");
  await addTag("Wiki笔记标签", "复盘");
  await click("text:保存属性");
  await waitFor("!document.querySelector('[data-wiki-properties-editor]')");
  await check(
    "document.querySelector('[data-wiki-note] h1').textContent==='复盘洞察'&&document.querySelectorAll('.wiki-property-tag').length===2",
    "标题与多标签属性可编辑并回读",
  );
  await click('[aria-label="切换Wiki信息侧栏"]');
  await click(".wiki-outline-row");
  await check(
    "!!document.querySelector('[data-wiki-panel=outline]')",
    "大纲按需展开并跳转",
  );
  await click("[data-wiki-panel] [role=tab]:nth-child(2)");
  await check(
    "document.querySelector('[data-wiki-panel=backlinks]').textContent.includes('反向链接')",
    "反链和本页链接独立查看",
  );
  await click('[aria-label="关闭Wiki辅助面板"]');
  await key("Meta+o");
  await fill('input[aria-label="快速查找Wiki笔记"]', "复盘洞察");
  await key("Enter");
  await check(
    "!document.querySelector('[data-wiki-quick]')",
    "快速打开支持快捷键与键盘确认",
  );
  await b.screenshot("/tmp/resumer-wiki-tags/screenshots/wiki-light-1440.png");
  await evaluate(
    "(async()=>{const m=await window.__appModule('/src/stores/ui-store.ts');m.useUIStore.setState({theme:'dark'});})()",
  );
  await waitFor("document.documentElement.dataset.appearance==='dark'");

  for (const [width, height] of [
    [1200, 800],
    [900, 700],
    [390, 700],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    await check(
      "document.documentElement.scrollWidth<=innerWidth+1",
      `${width}px Wiki无整页溢出`,
    );
    await click("text:AI 助手").catch(() =>
      click('[aria-label="切换Wiki信息侧栏"]'),
    );
    await check(
      "document.documentElement.scrollWidth<=innerWidth+1",
      `${width}px 辅助面板在边界内`,
    );
    await check("(()=>{const doc=document.querySelector('.wiki-document');const parents=[...document.querySelectorAll('.wiki-breadcrumb>span.contents')];return doc.getBoundingClientRect().width>640||parents.every(p=>getComputedStyle(p).display==='none')})()",`${width}px 路径随文档区收起父目录`);

    if (
      await evaluate(
        "!!document.querySelector('[aria-label=\"关闭Wiki辅助面板\"]')",
      )
    )
      await click('[aria-label="关闭Wiki辅助面板"]');
    await b.screenshot(`/tmp/resumer-wiki-tags/screenshots/wiki-${width}.png`);
  }
  assert.deepEqual(b.errors, [], "Wiki与标签流程无运行时异常");
  console.log(`PASS 多标签与Obsidian式Wiki交互 ${checks} 项`);
} catch (e) {
  console.log(await evaluate("document.body.innerText.slice(-6500)"));
  await b.screenshot("/tmp/resumer-wiki-tags/screenshots/error.png");
  throw e;
} finally {
  await b.close();
}
