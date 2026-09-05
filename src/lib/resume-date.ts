import type { DateStyle } from '@/lib/theme-config';

export function normalizeMonth(input: unknown): string {
  const value = String(input ?? '').trim();
  const match = value.match(/^(\d{4})[.\-/年](\d{1,2})月?$/) || value.match(/^(\d{4})(\d{2})$/);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, '0')}` : '';
}

export function formatMonth(value: unknown, style: DateStyle = 'dot', lang = 'zh'): string {
  const normalized = normalizeMonth(value);
  if (!normalized) return '';
  const [year, month] = normalized.split('-');
  if (style === 'cn') return lang === 'zh' ? `${year}年${Number(month)}月` : `${year}.${month}`;
  return style === 'dash' ? `${year}-${month}` : `${year}.${month}`;
}

export function normalizeResumeDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeResumeDates) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    if (key === 'startDate' || key === 'endDate' || key === 'date') return [key, typeof child === 'string' ? normalizeMonth(child) : child];
    return [key, normalizeResumeDates(child)];
  })) as T;
}

export function formatDateRange(start: unknown, end: unknown, options: { style?: DateStyle; current?: boolean; lang?: string } = {}): string {
  const from = formatMonth(start, options.style, options.lang);
  const to = options.current || !end ? (options.lang === 'zh' ? '至今' : 'Present') : formatMonth(end, options.style, options.lang);
  if (!from) return to === (options.lang === 'zh' ? '至今' : 'Present') ? '' : to;
  return `${from} - ${to}`;
}
