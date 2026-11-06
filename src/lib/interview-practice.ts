import type { Resume, ResumeSection, SectionContent } from '@/types/resume';
import type { PracticeSession, PracticeTarget } from '@/types/practice';
import { plainText } from './resume-text';

export function practiceTargets(sections: ResumeSection[]): PracticeTarget[] {
  return sections.filter(s => s.visible && ['work_experience','projects','custom','summary'].includes(s.type)).flatMap(section => {
    const content = section.content as unknown as Record<string, unknown>;
    const from = (item: Record<string, unknown>, itemId?: string) => {
      const label = [section.title, item.company || item.name || item.title].filter(Boolean).join(' · ');
      const fields: [string,unknown][] = [['description',item.description], ['text',item.text], ...(Array.isArray(item.highlights) ? item.highlights.map((text,index): [string,unknown] => [`highlights.${index}`,text]) : [])];
      return fields.flatMap(([field,text]) => typeof text === 'string' && plainText(text).trim() ? [{sectionId: section.id, itemId, field, text, label}] : []);
    };
    return Array.isArray(content.items) ? content.items.flatMap(item => from(item, item.id)) : from(content);
  });
}

export const targetKey = (target: PracticeTarget) => `${target.sectionId}:${target.itemId || ''}:${target.field}`;

/** 对原字段逐字比较，条目移位按 ID 定位；旧练习不能覆盖后来改过的经历。 */
export function practiceRewrite(resume: Resume, session: PracticeSession): {sectionId: string; content: Partial<SectionContent>} {
  if (resume.id !== session.resumeId || !session.target || !session.summary?.rewriteSuggestion.trim()) throw Error('没有可采纳的经历改写');
  const target = session.target;
  const section = resume.sections.find(s => s.id === target.sectionId);
  if (!section) throw Error('原模块已删除，请手动核对改写');
  const content = structuredClone(section.content) as unknown as Record<string, unknown>;
  const item = target.itemId ? (content.items as Record<string,unknown>[] | undefined)?.find(i => i.id === target.itemId) : content;
  if (!item) throw Error('原经历已删除，请手动核对改写');
  const index = target.field.startsWith('highlights.') ? Number(target.field.split('.')[1]) : null;
  const old = index === null ? item[target.field] : (item.highlights as string[] | undefined)?.[index];
  if (old !== target.text) throw Error('这条经历在练习后已修改，请先核对原文；没有覆盖当前内容');
  if (index === null) item[target.field] = session.summary.rewriteSuggestion;
  else (item.highlights as string[])[index] = session.summary.rewriteSuggestion;
  return {sectionId: section.id, content: content as Partial<SectionContent>};
}
