/** 告诉助手这段文字在简历里的位置，它才能用 updateSection 精确改这一条而不是重写整个模块。 */
export interface AiRewriteContext {
  sectionId: string;
  sectionTitle: string;
  /** 条目名（公司 · 职位 / 项目名），summary 之类无条目时省略 */
  item?: string;
  field: string;
}

export type AiRewriteMode = 'quantify' | 'star' | 'jd';

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
    quantify: {
      zh: '按「动词开头 + 方法 + 可衡量结果」量化改写；用户没给的数字用【建议补充：具体数据】占位，绝不编造。',
      en: 'Rewrite as "action verb + method + measurable result"; where no number was given, insert a [ADD: specific metric] placeholder — never invent figures.',
    },
    star: {
      zh: '按 STAR（情境-任务-行动-结果）压缩成 1–2 句，突出个人行动与结果，删掉"负责/参与"式弱表述。',
      en: 'Condense into 1–2 STAR sentences (situation-task-action-result), foregrounding personal action and outcome; drop weak "responsible for / participated in" phrasing.',
    },
    jd: {
      zh: '对照本简历关联投递的 JD，把同义表述替换成 JD 原词（ATS 只认原词）；没有关联 JD 就先说明，再给出通用改法。',
      en: 'Align wording with the JD linked to this resume, replacing synonyms with the JD\'s exact terms (ATS matches literal words); if no JD is linked, say so and give a generic improvement.',
    },
  };
  const rule = rules[mode][lang === 'en' ? 'en' : 'zh'];
  if (lang === 'en') {
    return (
      `Rewrite this entry at "${where}" (sectionId: ${context.sectionId}):\n"${text}"\n${rule}\n` +
      'Use the updateSection tool to update only this entry (keep everything else unchanged), then summarize the change in one sentence.'
    );
  }
  return (
    `请改写「${where}」（sectionId: ${context.sectionId}）里的这一条：\n「${text}」\n${rule}\n` +
    '用 updateSection 工具只更新这一条（其他内容保持不变），改完用一句话说明改了什么。'
  );
}

