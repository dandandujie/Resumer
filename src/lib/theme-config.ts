import type { ThemeConfig, ThemeFontSize, ResolvedTheme } from '@/types/resume';

export const BASE_THEME_FONT_SIZE = 14;
export const MIN_THEME_FONT_SIZE = 10;
export const MAX_THEME_FONT_SIZE = 20;
export const MAX_PAGE_MARGIN_MM = 40;
/** CSS 参考像素：1mm = 96 / 25.4 px，预览与页数预估都用它换算页边距。 */
export const PX_PER_MM = 96 / 25.4;

export type FontSchemeId =
  | 'songti'
  | 'heiti'
  | 'yahei'
  | 'kaiti'
  | 'fangsong'
  | 'latin-arial'
  | 'latin-times'
  | 'latin-calibri';
export type DateStyle = 'dot' | 'dash' | 'cn';
export type HeadingStyle = 'underline' | 'plain' | 'filled';

/**
 * 字体方案表：屏幕/导出字体栈 + Office 认识的中英文字体名。
 * DOCX 导出直接把 eastAsia/latin 传给 Rust，Rust 侧不再维护第二份映射。
 */
export const FONT_SCHEMES: Record<
  FontSchemeId,
  {
    screen: string;
    export: string;
    eastAsia: string;
    latin: string;
    /** 只在英文简历里展示的纯西文方案 */
    latinOnly?: boolean;
  }
> = {
  songti: {
    screen: "'SimSun', 'Songti SC', 'Reseumer Song', serif",
    export: "'Reseumer Song', 'SimSun', 'Songti SC', serif",
    eastAsia: '宋体',
    latin: 'Times New Roman',
  },
  heiti: {
    screen:
      "'SimHei', 'Microsoft YaHei', 'PingFang SC', 'Reseumer Hei', sans-serif",
    export:
      "'Reseumer Hei', 'SimHei', 'Microsoft YaHei', 'PingFang SC', sans-serif",
    eastAsia: '黑体',
    latin: 'Arial',
  },
  yahei: {
    screen: "'Microsoft YaHei', 'PingFang SC', 'Reseumer Hei', sans-serif",
    export: "'Reseumer Hei', 'Microsoft YaHei', 'PingFang SC', sans-serif",
    eastAsia: '微软雅黑',
    latin: 'Calibri',
  },
  kaiti: {
    screen: "'KaiTi', 'Kaiti SC', 'Reseumer Kai', serif",
    export: "'Reseumer Kai', 'KaiTi', 'Kaiti SC', serif",
    eastAsia: '楷体',
    latin: 'Times New Roman',
  },
  fangsong: {
    screen: "'FangSong', 'STFangsong', 'Reseumer Song', serif",
    export: "'Reseumer Song', 'FangSong', 'STFangsong', serif",
    eastAsia: '仿宋',
    latin: 'Times New Roman',
  },
  'latin-arial': {
    screen: "Arial, 'Reseumer Hei', sans-serif",
    export: "'Reseumer Hei', Arial, sans-serif",
    eastAsia: '微软雅黑',
    latin: 'Arial',
    latinOnly: true,
  },
  'latin-times': {
    screen: "'Times New Roman', 'Reseumer Song', serif",
    export: "'Reseumer Song', 'Times New Roman', serif",
    eastAsia: '宋体',
    latin: 'Times New Roman',
    latinOnly: true,
  },
  'latin-calibri': {
    screen: "Calibri, 'Reseumer Hei', sans-serif",
    export: "'Reseumer Hei', Calibri, sans-serif",
    eastAsia: '微软雅黑',
    latin: 'Calibri',
    latinOnly: true,
  },
};

export function isFontSchemeId(value: unknown): value is FontSchemeId {
  return typeof value === 'string' && value in FONT_SCHEMES;
}

/** 唯一默认主题。预览、导出、导入基底、预设都从这里派生。 */
export const DEFAULT_THEME: ResolvedTheme = {
  fontScheme: 'yahei',
  bodyColor: '#1a1a1a',
  primaryColor: '#1a1a1a',
  accentColor: '#1a1a1a',
  fontSize: 14,
  lineSpacing: 1.35,
  sectionSpacing: 6,
  margin: { top: 18, right: 18, bottom: 18, left: 18 },
  marginUnit: 'mm',
  dateStyle: 'dot',
  headingStyle: 'underline',
  avatarStyle: 'oneInch',
  infoLayout: 'inline',
};

const LEGACY_FONT_SIZE_MAP: Record<'small' | 'medium' | 'large', number> = {
  small: 12,
  medium: 14,
  large: 16,
};
const LEGACY_FONT_MAP: Record<string, FontSchemeId> = {
  Georgia: 'songti',
  Palatino: 'songti',
  'Times New Roman': 'songti',
  Garamond: 'songti',
  SimSun: 'songti',
  Inter: 'yahei',
  Helvetica: 'yahei',
  Arial: 'yahei',
  Verdana: 'yahei',
  'Microsoft YaHei': 'yahei',
  KaiTi: 'kaiti',
  'LXGW WenKai': 'kaiti',
};

/** 中文字号档位；显示名走 i18n 键 `themeEditor.fontSizeStep.<key>`。 */
export const FONT_SIZE_STEPS = [
  { key: 'xiaowu', px: 12, pt: 9 },
  { key: 'wuhao', px: 14, pt: 10.5 },
  { key: 'xiaosi', px: 16, pt: 12 },
  { key: 'sihao', px: 18.7, pt: 14 },
] as const;
export const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;

export function resolveThemeFontSize(fontSize?: ThemeFontSize): number {
  if (typeof fontSize === 'number' && Number.isFinite(fontSize))
    return Math.min(
      Math.max(fontSize, MIN_THEME_FONT_SIZE),
      MAX_THEME_FONT_SIZE,
    );
  if (typeof fontSize === 'string' && fontSize in LEGACY_FONT_SIZE_MAP)
    return LEGACY_FONT_SIZE_MAP[fontSize];
  return BASE_THEME_FONT_SIZE;
}

const clampMargin = (value: number) =>
  Math.min(MAX_PAGE_MARGIN_MM, Math.max(0, Math.round(value * 10) / 10));

/**
 * 旧版主题的页边距是 px（默认 20–28）。只有带 `marginUnit: 'mm'` 标记的值才按 mm 读取，
 * 否则一律按 px 换算——不能靠数值范围猜单位，20px 和 20mm 都是合法值。
 */
function resolveMargin(value: Partial<ThemeConfig>): ResolvedTheme['margin'] {
  const raw: Partial<ResolvedTheme['margin']> = value.margin || {};
  const isMm = value.marginUnit === 'mm';
  const pick = (side: keyof ResolvedTheme['margin']) => {
    const n = raw[side];
    if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_THEME.margin[side];
    return clampMargin(isMm ? n : n / PX_PER_MM);
  };
  return { top: pick('top'), right: pick('right'), bottom: pick('bottom'), left: pick('left') };
}

export function resolveTheme(raw?: Partial<ThemeConfig> | null): ResolvedTheme {
  const value = raw || {};
  const legacyFamily = value.fontFamily ? LEGACY_FONT_MAP[value.fontFamily] : undefined;
  const fontScheme = isFontSchemeId(value.fontScheme)
    ? value.fontScheme
    : legacyFamily || DEFAULT_THEME.fontScheme;
  return {
    ...DEFAULT_THEME,
    ...value,
    fontScheme,
    fontSize: resolveThemeFontSize(value.fontSize),
    margin: resolveMargin(value),
    marginUnit: 'mm',
  } as ResolvedTheme;
}

export function resolveCssFontScale(fontSize?: ThemeFontSize) {
  const body = resolveThemeFontSize(fontSize);
  return {
    body: `${body}px`,
    h1: `${body * 1.6}px`,
    h2: `${body * 1.15}px`,
    h3: `${body}px`,
  };
}
export function resolveScreenFontStack(scheme: FontSchemeId) {
  return FONT_SCHEMES[scheme].screen;
}
export function resolveExportFontStack(scheme: FontSchemeId) {
  return FONT_SCHEMES[scheme].export;
}
export function resolveOfficeFonts(scheme: FontSchemeId) {
  const { eastAsia, latin } = FONT_SCHEMES[scheme];
  return { eastAsia, latin };
}

/**
 * 预设是完整主题：套用即整体替换，不会残留上一预设的字段。
 * 显示名走 i18n 键 `themeEditor.presetLabels.<id>`。
 */
export const THEME_PRESETS: Record<string, ResolvedTheme> = {
  standard: DEFAULT_THEME,
  'songti-classic': { ...DEFAULT_THEME, fontScheme: 'songti', lineSpacing: 1.3 },
  compact: {
    ...DEFAULT_THEME,
    fontScheme: 'heiti',
    fontSize: 12,
    lineSpacing: 1.25,
    margin: { top: 14, right: 14, bottom: 14, left: 14 },
    sectionSpacing: 4,
  },
  soe: {
    ...DEFAULT_THEME,
    fontScheme: 'songti',
    fontSize: 16,
    lineSpacing: 1.5,
    infoLayout: 'grid',
    avatarStyle: 'oneInch',
  },
  foreign: {
    ...DEFAULT_THEME,
    fontScheme: 'latin-arial',
    fontSize: 14.7,
    lineSpacing: 1.3,
    avatarStyle: 'circle',
  },
  'accent-blue': { ...DEFAULT_THEME, primaryColor: '#1f3a5f', accentColor: '#1f3a5f' },
};

/** 当前主题与哪个预设完全一致（用于工具条高亮）；被微调过就返回 null。 */
export function matchPreset(theme: ResolvedTheme): string | null {
  const entry = Object.entries(THEME_PRESETS).find(
    ([, preset]) => JSON.stringify(preset) === JSON.stringify(theme),
  );
  return entry ? entry[0] : null;
}

export function buildThemeCss(
  scopeSelector: string,
  theme: ResolvedTheme,
  options: { export?: boolean } = {},
) {
  const fs = resolveCssFontScale(theme.fontSize);
  const m = theme.margin;
  const headingStyle =
    theme.headingStyle === 'plain'
      ? `${scopeSelector} h2 { border-bottom: 0 !important; }`
      : theme.headingStyle === 'filled'
        ? `${scopeSelector} h2 { border-bottom: 0 !important; background: var(--resume-accent-color) !important; ` +
          `color: #fff !important; padding: 2px 6px !important; }`
        : `${scopeSelector} h2 { border-bottom: 1px solid var(--resume-accent-color) !important; }`;
  const fontFamily = options.export
    ? resolveExportFontStack(theme.fontScheme)
    : resolveScreenFontStack(theme.fontScheme);
  return [
    `${scopeSelector} > div { font-family: ${fontFamily} !important; line-height: ${theme.lineSpacing} !important; ` +
      `padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm !important; ` +
      `--base-body-size:${fs.body}; --base-h1-size:${fs.h1}; --base-h2-size:${fs.h2}; ` +
      `--base-h3-size:${fs.h3}; --base-line-spacing:${theme.lineSpacing}; ` +
      `--base-section-spacing:${theme.sectionSpacing}px; --resume-body-color:${theme.bodyColor}; ` +
      `--resume-primary-color:${theme.primaryColor}; --resume-accent-color:${theme.accentColor}; }`,
    `${scopeSelector} p, ${scopeSelector} li, ${scopeSelector} span, ${scopeSelector} td, ` +
      `${scopeSelector} a, ${scopeSelector} div { font-size:${fs.body} !important; ` +
      `line-height:${theme.lineSpacing} !important; color:var(--resume-body-color); }`,
    `${scopeSelector} h1 { color:var(--resume-primary-color) !important; font-size:${fs.h1} !important; ` +
      `line-height:${theme.lineSpacing} !important; }`,
    `${scopeSelector} h2, ${scopeSelector} h3 { color:var(--resume-primary-color) !important; ` +
      `font-size:${fs.h2} !important; line-height:${theme.lineSpacing} !important; ` +
      `border-color:var(--resume-accent-color) !important; }`,
    `${scopeSelector} [data-section] { margin-bottom:${theme.sectionSpacing}px !important; }`,
    `${scopeSelector} [data-zone="dark"], ${scopeSelector} [data-zone="dark"] * { color:#fff !important; }`,
    `${scopeSelector} [data-zone="dark"] h2 { border-color:rgba(255,255,255,.35) !important; }`,
    headingStyle,
  ].join('\n');
}
