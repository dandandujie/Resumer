import type { Resume } from '@/types/resume';

/** SQLite 接口使用 Unix 秒；只在接口边界转换，避免列表、编辑器和 AI 回读各自换算。 */
export function normalizeResumeData(data: Record<string, any>): Resume {
  const date = (value: number | string | Date) => value instanceof Date
    ? value
    : new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return {
    ...data,
    themeConfig: data.themeConfig || {},
    createdAt: date(data.createdAt),
    updatedAt: date(data.updatedAt),
    sections: (data.sections || []).map((section: Record<string, any>) => ({
      ...section,
      createdAt: date(section.createdAt),
      updatedAt: date(section.updatedAt),
    })),
  } as Resume;
}
