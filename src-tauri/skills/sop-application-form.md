# SOP：官网申请表自动填写

> 用户在公司官网/ATS（Moka、北森、Workday 等）投递遇到冗长申请表时，读取表单结构、映射简历与全局事实、逐字段填写。填写但绝不代提交。

## 适用场景与铁律
- 场景：官网投递页的"填空+选择"式申请表——问法各异但内容大差不差（个人信息/教育/工作/期望/合规问题）。
- 铁律 1：**只填写不提交**。所有"提交/下一步/申请"按钮留给用户，填完输出核对清单。
- 铁律 2：**不编造**。简历和 L2 全局事实里没有的信息（期望薪资、到岗时间、婚育、证件号等），一次性问齐用户，答案立即存入 L2——下一家公司的表就不用再问。
- 铁律 3：涉及证件号/银行卡等高敏信息，即使用户提供也建议由用户手填，AI 不经手。

## 第 1 步：读取表单结构
用 browserEval 执行（可按需裁剪）：
```js
(() => {
  const fields = [];
  document.querySelectorAll('input, select, textarea').forEach((el, i) => {
    if (el.type === 'hidden' || !el.offsetParent) return;
    const label = (el.labels?.[0]?.innerText
      || el.closest('[class*="form-item"], [class*="field"], li, .el-form-item')?.querySelector('label, [class*="label"]')?.innerText
      || el.placeholder || el.name || '').trim().slice(0, 60);
    const opts = el.tagName === 'SELECT'
      ? [...el.options].map(o => o.text.trim()).slice(0, 20) : undefined;
    fields.push({ i, tag: el.tagName, type: el.type || '', label, name: el.name,
      required: el.required || /[*＊]/.test(label), value: el.value?.slice(0, 40), opts });
  });
  return fields;
})()
```
自定义下拉（div 模拟的 select，Moka/北森常见）：记录触发元素文本，点击展开后再读选项。

## 第 2 步：语义映射（常见字段 → 数据源）
| 表单问法（各种变体） | 数据源 |
|---|---|
| 姓名/Name | 简历 personal_info.fullName |
| 手机/电话/联系方式 | personal_info.phone |
| 邮箱/Email | personal_info.email |
| 现居城市/所在地 | personal_info.location |
| 最高学历/学位/毕业院校/专业/毕业时间 | education 最新一条 |
| 工作年限/参加工作时间 | 由 work_experience 最早 startDate 推算 |
| 当前/最近公司、职位、在职时间 | work_experience 第一条 |
| 期望薪资/薪资要求 | L2 全局事实（没有则问用户；开放题建议填"面议"并征询） |
| 到岗时间/离职状态 | L2 全局事实 |
| 期望城市/是否接受出差、外派 | L2 全局事实 |
| 政治面貌/婚育/籍贯（国企常见） | L2 全局事实 |
| 是否有亲属在本公司/竞业限制/被开除记录 | 合规题：必须问用户，逐题确认，不得代答 |
| 自我评价/个人优势（开放题） | 基于简历 summary 现场生成 ≤ 字数限制，先给用户过目 |
| 信息来源/如何得知该职位 | 问用户或选"招聘网站" |

## 第 3 步：填值（受控组件安全写法）
现代 ATS 前端多为 React/Vue 受控组件，直接 `el.value=x` 会被状态覆盖。用原生 setter + 事件：
```js
(() => {
  const setValue = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };
  // 示例：setValue(document.querySelectorAll('input')[3], '张三');
})()
```
- 原生 select：设 `el.value` 后 dispatch change。
- radio/checkbox：`el.click()`（触发框架监听）。
- 自定义下拉：先 click 触发器，等待渲染后 click 目标选项（分两次 browserEval，中间确认展开成功）。
- 每填 3-5 个字段回读一次值确认生效，防止被框架回滚。
- 日期控件写入失败时，告知用户该字段需手选。

## 第 4 步：交付核对
输出三栏清单：✅ 已填（字段→值）｜❓ 待用户确认（开放题草稿）｜✋ 需手填（敏感/控件不支持）。
提醒用户核对后自行点提交。新获取的稳定答案（薪资/到岗/婚育等）updateGlobalFacts 入库，并把该公司表单的特殊问法追加进本 SOP（saveSkill 覆盖更新）——表填得越多，下次越快。
