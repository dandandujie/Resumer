import type { DateStyle } from '@/lib/theme-config';

// 不变量：存储优先 YYYY-MM；无法归一化的值原样保留、原样显示，绝不清空。
// 用户在证书/自定义模块里常写 `2023`、`至今`、`Summer 2022`，这些是合法内容而不是坏数据。

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const PRESENT_LABEL: Record<string, string> = { zh: '至今', en: 'Present' };

function presentLabel(lang?: string) {
  return PRESENT_LABEL[lang === 'en' ? 'en' : 'zh'];
}

function toYearMonth(year: string, month: number): string {
  return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}` : '';
}

/** 把各种月份写法归一化为 `YYYY-MM`；识别不了返回空串（调用方决定是否保留原值）。 */
export function normalizeMonth(input: unknown): string {
  const value = String(input ?? '').trim();
  if (!value) return '';
  // 2022-07 / 2022.7 / 2022/07 / 2022年7月，允许尾随日：2022-07-15 / 2022年7月15日
  const ymd = value.match(/^(\d{4})[.\-/年]\s*(\d{1,2})(?:月?(?:[.\-/]|\s*)?(\d{1,2})?\s*日?)?$/);
  if (ymd) return toYearMonth(ymd[1], Number(ymd[2]));
  const compact = value.match(/^(\d{4})(\d{2})$/);
  if (compact) return toYearMonth(compact[1], Number(compact[2]));
  // 07/2022（英文简历常见）
  const monthFirst = value.match(/^(\d{1,2})[./](\d{4})$/);
  if (monthFirst) return toYearMonth(monthFirst[2], Number(monthFirst[1]));
  // Jul 2022 / July 2022 / Jul. 2022 / Jul, 2022
  const english = value.match(/^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (english) {
    const name = english[1].toLowerCase();
    const month = MONTH_NAMES[name.slice(0, 4)] ?? MONTH_NAMES[name.slice(0, 3)];
    return month ? toYearMonth(english[2], month) : '';
  }
  return '';
}

/** 显示用：能归一化的按 style 输出，否则原样返回（例如 `2023`、`至今`）。 */
export function formatMonth(value: unknown, style: DateStyle = 'dot', lang = 'zh'): string {
  const raw = String(value ?? '').trim();
  const normalized = normalizeMonth(raw);
  if (!normalized) return raw;
  const [year, month] = normalized.split('-');
  if (style === 'cn') return lang === 'zh' ? `${year}年${Number(month)}月` : `${year}.${month}`;
  return style === 'dash' ? `${year}-${month}` : `${year}.${month}`;
}

/** 递归归一化 startDate / endDate / date 字段；归一化失败保留原值。 */
export function normalizeResumeDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeResumeDates) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if ((key === 'startDate' || key === 'endDate' || key === 'date') && typeof child === 'string') {
        return [key, normalizeMonth(child) || child.trim()];
      }
      return [key, normalizeResumeDates(child)];
    }),
  ) as T;
}

export function formatDateRange(
  start: unknown,
  end: unknown,
  options: { style?: DateStyle; current?: boolean; lang?: string } = {},
): string {
  const present = presentLabel(options.lang);
  const from = formatMonth(start, options.style, options.lang);
  const endText = String(end ?? '').trim();
  const to = options.current || !endText ? present : formatMonth(endText, options.style, options.lang);
  if (!from) return to === present ? '' : to;
  return `${from} - ${to}`;
}
