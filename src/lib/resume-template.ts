import type { Resume, ResumeSection, ResolvedTheme } from '@/types/resume';
import { resolveTheme } from './theme-config';

export interface TemplateSection { type: string; title: string; visible: boolean }
export interface ResumeTemplate {
  id: string;
  name: string;
  theme: ResolvedTheme;
  /** 缺失表示旧的纯排版预设；套用时不改变版式和模块顺序。 */
  template?: 'classic' | 'modern';
  sections?: TemplateSection[];
}

export function captureTemplate(resume: Resume): Pick<ResumeTemplate, 'theme' | 'template' | 'sections'> {
  return {
    theme: resolveTheme(resume.themeConfig),
    template: resume.template === 'modern' ? 'modern' : 'classic',
    sections: resume.sections.map(({ type, title, visible }) => ({ type, title, visible })),
  };
}

/** 按类型与出现次序配对，保留所有已有内容和 ID；没有对应模块的条目留在末尾。 */
export function arrangeTemplateSections(sections: ResumeSection[], structure?: TemplateSection[]): ResumeSection[] {
  if (!structure) return sections;
  const remaining = [...sections];
  const arranged: ResumeSection[] = [];
  for (const slot of structure) {
    const index = remaining.findIndex(section => section.type === slot.type);
    if (index < 0) continue;
    arranged.push(remaining.splice(index, 1)[0]);
  }
  return [...arranged, ...remaining].map((section, sortOrder) => ({ ...section, sortOrder }));
}

export function templateMatches(resume: Resume, preset: ResumeTemplate): boolean {
  const theme = resolveTheme(resume.themeConfig);
  if ((Object.keys(theme) as (keyof ResolvedTheme)[]).some(key => key in preset.theme && JSON.stringify(theme[key]) !== JSON.stringify(preset.theme[key]))) return false;
  if (preset.template && preset.template !== resume.template) return false;
  return !preset.sections || preset.sections.map(s => s.type).join('|') === resume.sections.map(s => s.type).join('|');
}
