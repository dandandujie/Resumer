import type { Resume } from '@/types/resume';
import { plainText } from './resume-text';
import { resolveTheme } from './theme-config';

export interface VersionChange {
  key: string;
  kind: 'added' | 'removed' | 'changed' | 'format' | 'visibility' | 'order' | 'title' | 'template' | 'language' | 'theme';
  title: string;
  before: string;
  after: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? '';
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.startsWith('data:') ? '' : plainText(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !['id', 'avatar'].includes(key)).map(([, v]) => text(v)).filter(Boolean).join('\n');
  return typeof value === 'number' ? String(value) : '';
}

/** 只比较用户可编辑的数据；数据库时间戳、简历归属和对象键顺序不算改动。 */
export function compareResumeVersions(before: Resume, after: Resume): VersionChange[] {
  const changes: VersionChange[] = [];
  for (const key of ['title', 'template', 'language'] as const) {
    if (before[key] !== after[key]) changes.push({ key, kind: key, title: '', before: before[key] || '', after: after[key] || '' });
  }
  if (stable(resolveTheme(before.themeConfig)) !== stable(resolveTheme(after.themeConfig))) changes.push({ key: 'theme', kind: 'theme', title: '', before: '', after: '' });
  const previous = new Map((before.sections || []).map(section => [section.id, section]));
  const next = new Map((after.sections || []).map(section => [section.id, section]));
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const a = previous.get(id), b = next.get(id);
    const title = b?.title || a?.title || '';
    if (!a || !b) changes.push({ key: id, kind: a ? 'removed' : 'added', title, before: a ? text(a.content) : '', after: b ? text(b.content) : '' });
    else {
      if (a.title !== b.title || stable(a.content) !== stable(b.content)) {
        const oldText = text(a.content), newText = text(b.content);
        changes.push({ key: id, kind: a.title === b.title && oldText === newText ? 'format' : 'changed', title, before: [a.title, oldText].join('\n'), after: [b.title, newText].join('\n') });
      }
      if (a.visible !== b.visible) changes.push({ key: `${id}-visible`, kind: 'visibility', title, before: String(a.visible !== false), after: String(b.visible !== false) });
    }
  }
  const order = (resume: Resume) => (resume.sections || []).filter(s => previous.has(s.id) && next.has(s.id)).map(s => s.id).join(',');
  if (order(before) !== order(after)) changes.push({ key: 'order', kind: 'order', title: '', before: before.sections.map(s => s.title).join(' → '), after: after.sections.map(s => s.title).join(' → ') });
  return changes;
}
