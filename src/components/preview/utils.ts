import type { ResumeSection, SummaryContent, SkillsContent } from '@/types/resume';

export { md } from '@/lib/resume-text';

/** Join degree and field with separator */
export function degreeField(degree: string, field: string | undefined): string {
  if (!field) return degree;
  return `${degree} - ${field}`;
}

export function isSectionEmpty(section: ResumeSection): boolean {
  const content = section.content as any;
  // Defensive: a missing/null content object counts as empty (and must never
  // reach the `'items' in content` / `content.text` checks below, which throw
  // on null — that would white-screen the whole preview).
  if (!content) return true;

  if (section.type === 'summary') {
    return !(content as SummaryContent).text;
  }

  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories;
    return !categories?.length || categories.every((cat) => !cat.skills?.length);
  }

  // work_experience, education, projects, certifications, languages, custom
  if ('items' in content) {
    return !content.items?.length;
  }

  return false;
}
