/** 告诉助手这段文字在简历里的位置，它才能用 updateSection 精确改这一条而不是重写整个模块。 */
export interface AiRewriteContext {
  sectionId: string;
  sectionTitle: string;
  /** 条目名（公司 · 职位 / 项目名），summary 之类无条目时省略 */
  item?: string;
  itemId?: string;
  fieldPath?: string;
  field: string;
}

export type AiRewriteMode = 'clear' | 'quantify' | 'star' | 'jd';

/**
 * 逐条改写指令。不新建 AI 通道：把一条足够精确的消息交给右侧助手，
 * 助手走既有的工具循环 → updateSection → 提案卡，用户仍然是采纳/撤销的裁判。
 */
export function buildRewriteInstruction(
  mode: AiRewriteMode,
  text: string,
  context: AiRewriteContext,
  lang: string,
): string {
  const where = [context.sectionTitle, context.item, context.field].filter(Boolean).join(' › ');
  const rules: Record<AiRewriteMode, { zh: string; en: string }> = {
    clear: {
      zh: '把这段话写得清楚、自然、简洁，保留已知职责和参与程度；不要求补数字，不套模板。',
      en: 'Make this entry clear, natural and concise, preserving known responsibilities and contribution level; do not demand metrics or impose a template.',
    },
    quantify: {
      zh: '让行动和结果更具体，只使用已知数字；没有数字也能给完整可用的表述，绝不编造。在提案之外最多建议补充一个有价值的数据，不往简历里塞占位符。',
      en: 'Make the action and outcome more specific using only known figures. Keep the entry usable without metrics or placeholders. Suggest at most one useful missing fact outside the proposal; never invent figures.',
    },
    star: {
      zh: '借助 STAR 在内部梳理背景、行动和已知结果，写成自然的 1–2 句；保留真实的个人职责和参与程度，不把参与改成主导，缺少结果时不补造。',
      en: 'Use STAR internally to organize context, actions and known outcomes into 1–2 natural sentences. Preserve the actual contribution level; never upgrade participation to leadership or invent outcomes.',
    },
    jd: {
      zh: '对照关联投递的 JD，突出已有且相关的事实，仅在意思准确时使用岗位术语；不堆关键词，不承诺 ATS 结果。没有 JD 就先请用户提供目标岗位，不假装已完成岗位匹配。',
      en: 'Use the linked JD to emphasize relevant known evidence and accurate role terminology. Avoid keyword stuffing or ATS guarantees. If no JD is available, ask for the target role instead of claiming alignment.',
    },
  };
  const rule = rules[mode][lang === 'en' ? 'en' : 'zh'];
  if (lang === 'en') {
    return (
      `Rewrite this entry at "${where}" (sectionId: ${context.sectionId}):\n"${text}"\n${rule}\n` +
      'Use updateSection to prepare a proposal for only this entry, preserving everything else. It takes effect only after user review and acceptance; briefly explain the proposal without claiming it is saved.'
    );
  }
  return (
    `请改写「${where}」（sectionId: ${context.sectionId}）里的这一条：\n「${text}」\n${rule}\n` +
    '用 updateSection 只准备这一条的改写提案，保留其它内容；用户审阅采纳后才生效。用一句话说明建议，不声称已保存。'
  );
}

