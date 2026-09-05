import { buildThemeCss, resolveTheme } from '@/lib/theme-config';
import type {
  PersonalInfoContent,
  SkillsContent,
  SummaryContent,
  Resume,
  ResumeSection,
} from '@/types/resume';

export type ResumeWithSections = Resume;
export type Section = ResumeSection;

// ─── Helpers ──────────────────────────────────────────────────

export function esc(text: unknown): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safe(val: unknown): string {
  return val != null ? String(val) : '';
}

export function degreeField(degree: string, field: string | undefined): string {
  if (!field) return degree;
  return `${degree} - ${field}`;
}

export function md(text: unknown): string {
  if (text == null) return '';
  let s = String(text);
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  if (!s.includes('\n')) return s;
  const lines = s.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    const lm = line.match(/^[-–•]\s+(.*)/);
    if (lm) {
      if (!inList) { html += '<ul style="margin:2px 0;padding-left:1.5em;list-style-type:disc">'; inList = true; }
      html += `<li>${lm[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += (html && !html.endsWith('>') ? '<br>' : '') + line;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

// ─── Section empty check ──────────────────────────────────────

export function isSectionEmpty(section: Section): boolean {
  const content = section.content as any;
  if (section.type === 'summary') return !(content as SummaryContent).text;
  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories;
    return !categories?.length || categories.every((cat: any) => !cat.skills?.length);
  }
  if ('items' in content) return !content.items?.length;
  return false;
}

// ─── HTML helpers ─────────────────────────────────────────────

export function visibleSections(resume: ResumeWithSections): Section[] {
  return resume.sections.filter((s: Section) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s));
}

export function getPersonalInfo(resume: ResumeWithSections): PersonalInfoContent {
  const sec = resume.sections.find((s: Section) => s.type === 'personal_info');
  return (sec?.content || {}) as PersonalInfoContent;
}

export function buildHighlights(highlights: string[] | undefined, liClass: string, bulletStyle?: string): string {
  if (!highlights?.length) return '';
  if (bulletStyle === 'custom-dot') {
    return highlights.map(h =>
      `<li class="flex items-start gap-2 text-sm text-zinc-600"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style="background:linear-gradient(135deg,#7c3aed,#f97316)"></span>${md(h)}</li>`
    ).join('');
  }
  return highlights.filter(Boolean).map(h => `<li class="${liClass}">${md(h)}</li>`).join('');
}

// ─── QR codes inline HTML (SVGs pre-generated in builders.ts) ─

export function buildQrCodesHtml(section: Section): string {
  const c = section.content as any;
  const svgs = (c._qrSvgs || {}) as Record<string, string>;
  const items = (c.items || []).filter((q: any) => q.url?.trim() && svgs[q.id]);
  if (items.length === 0) return '';
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px 24px;padding-top:4px">${items.map((qr: any) =>
    `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:96px">${svgs[qr.id]}<span style="font-size:10px;color:#6b7280;line-height:1.2;text-align:center;word-break:break-all;max-width:96px">${esc(qr.label)}</span></div>`
  ).join('')}</div>`;
}

// ─── Theme CSS for HTML export ────────────────────────────────

export function buildExportThemeCSS(rawTheme: Parameters<typeof resolveTheme>[0]): string {
  return buildThemeCss('.resume-export', resolveTheme(rawTheme), { export: true });
}
