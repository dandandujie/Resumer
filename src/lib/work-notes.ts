import type { ResumeSection, WorkExperienceContent, WorkExperienceItem } from '@/types/resume';

/** 只追加用户已审阅的素材；稳定 ID 定位，比较目标条目防止旧提案覆盖新编辑。 */
export function appendNoteMaterial(sections: ResumeSection[], sectionId: string, before: WorkExperienceItem, routine: string[], events: string[]): WorkExperienceContent {
  const section = sections.find(s => s.id === sectionId && s.type === 'work_experience');
  const items = (section?.content as WorkExperienceContent | undefined)?.items;
  const current = items?.find(i => i.id === before.id);
  if (!items || !current) throw Error('这段经历已删除，请重新选择');
  if (JSON.stringify(current) !== JSON.stringify(before)) throw Error('这段经历刚刚有修改，请重新打开素材再核对');
  const lines = routine.map(s => s.trim()).filter(Boolean);
  const highlights = events.map(s => s.trim()).filter(Boolean);
  if (!lines.length && !highlights.length) throw Error('先选一条想补充的素材');
  return { items: items.map(item => item.id === before.id ? {
    ...item,
    description: [item.description, ...lines.filter(line => !item.description.split('\n').includes(line))].filter(Boolean).join('\n'),
    highlights: [...new Set([...(item.highlights || []), ...highlights])],
  } : item) };
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 本机审阅缓存只保存指纹，不复制来源原文。不是安全校验，采纳仍由后端核对。 */
export function noteDraftFingerprint(value: unknown): string {
  const raw = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return String(hash >>> 0);
}
