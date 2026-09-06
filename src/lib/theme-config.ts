import type { ThemeConfig, ThemeFontSize, ResolvedTheme } from '@/types/resume';

export const BASE_THEME_FONT_SIZE = 14;
export const MIN_THEME_FONT_SIZE = 10;
export const MAX_THEME_FONT_SIZE = 20;

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

export const FONT_SCHEMES: Record<
  FontSchemeId,
  {
    label: string;
    screen: string;
    export: string;
    eastAsia: string;
    latin: string;
  }
> = {
  songti: {
    label: '宋体 + Times New Roman',
    screen: "'SimSun', 'Songti SC', 'Reseumer Song', serif",
    export: "'Reseumer Song', 'SimSun', 'Songti SC', serif",
    eastAsia: '宋体',
    latin: 'Times New Roman',
  },
  heiti: {
    label: '黑体 + Arial',
    screen:
      "'SimHei', 'Microsoft YaHei', 'PingFang SC', 'Reseumer Hei', sans-serif",
    export:
      "'Reseumer Hei', 'SimHei', 'Microsoft YaHei', 'PingFang SC', sans-serif",
    eastAsia: '黑体',
    latin: 'Arial',
  },
  yahei: {
    label: '微软雅黑 + Calibri',
    screen: "'Microsoft YaHei', 'PingFang SC', 'Reseumer Hei', sans-serif",
    export: "'Reseumer Hei', 'Microsoft YaHei', 'PingFang SC', sans-serif",
    eastAsia: '微软雅黑',
    latin: 'Calibri',
  },
  kaiti: {
    label: '楷体 + Times New Roman',
    screen: "'KaiTi', 'Kaiti SC', 'Reseumer Kai', serif",
    export: "'Reseumer Kai', 'KaiTi', 'Kaiti SC', serif",
    eastAsia: '楷体',
    latin: 'Times New Roman',
  },
  fangsong: {
    label: '仿宋 + Times New Roman',
    screen: "'FangSong', 'STFangsong', 'Reseumer Song', serif",
    export: "'Reseumer Song', 'FangSong', 'STFangsong', serif",
    eastAsia: '仿宋',
    latin: 'Times New Roman',
  },
  'latin-arial': {
    label: 'Arial',
    screen: "Arial, 'Reseumer Hei', sans-serif",
    export: "'Reseumer Hei', Arial, sans-serif",
    eastAsia: '微软雅黑',
    latin: 'Arial',
  },
  'latin-times': {
    label: 'Times New Roman',
    screen: "'Times New Roman', 'Reseumer Song', serif",
    export: "'Reseumer Song', 'Times New Roman', serif",
    eastAsia: '宋体',
    latin: 'Times New Roman',
  },
  'latin-calibri': {
    label: 'Calibri',
    screen: "Calibri, 'Reseumer Hei', sans-serif",
    export: "'Reseumer Hei', Calibri, sans-serif",
    eastAsia: '微软雅黑',
    latin: 'Calibri',
  },
};

const BASE_THEME: ResolvedTheme = {
  fontScheme: 'yahei',
  bodyColor: '#1a1a1a',
  primaryColor: '#1a1a1a',
  accentColor: '#1a1a1a',
  fontSize: 14,
  lineSpacing: 1.35,
  sectionSpacing: 6,
  margin: { top: 18, right: 18, bottom: 18, left: 18 },
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

export const FONT_SIZE_STEPS = [
  { px: 12, pt: 9, label: '小五' },
  { px: 14, pt: 10.5, label: '五号' },
  { px: 16, pt: 12, label: '小四' },
  { px: 18.7, pt: 14, label: '四号' },
] as const;
export const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;
export const ptToPx = (pt: number) => Math.round((pt / 0.75) * 10) / 10;

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

export function resolveTheme(raw?: Partial<ThemeConfig> | null): ResolvedTheme {
  const value = raw || {};
  const legacyFamily = value.fontFamily
    ? LEGACY_FONT_MAP[value.fontFamily]
    : undefined;
  const oldMargin: Partial<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }> = value.margin || {};
  const marginValue = (n: number | undefined, fallback: number) => {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(
      40,
      Math.max(0, (n as number) > 40 ? (n as number) * 0.2646 : (n as number)),
    );
  };
  return {
    ...BASE_THEME,
    ...value,
    fontScheme: value.fontScheme || legacyFamily || BASE_THEME.fontScheme,
    fontSize: resolveThemeFontSize(value.fontSize),
    margin: {
      top: marginValue(oldMargin.top, 18),
      right: marginValue(oldMargin.right, 18),
      bottom: marginValue(oldMargin.bottom, 18),
      left: marginValue(oldMargin.left, 18),
    },
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
export function resolveThemeFontStack(fontScheme?: FontSchemeId) {
  return (
    FONT_SCHEMES[fontScheme || 'yahei']?.screen || FONT_SCHEMES.yahei.screen
  );
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

export const THEME_PRESETS: Record<
  string,
  { label: string; config: Partial<ResolvedTheme> }
> = {
  standard: {
    label: '标准',
    config: {
      fontScheme: 'yahei',
      fontSize: 14,
      lineSpacing: 1.35,
      margin: { top: 18, right: 18, bottom: 18, left: 18 },
    },
  },
  'songti-classic': {
    label: '经典宋体',
    config: {
      fontScheme: 'songti',
      fontSize: 14,
      lineSpacing: 1.3,
      headingStyle: 'underline',
    },
  },
  compact: {
    label: '紧凑一页',
    config: {
      fontScheme: 'heiti',
      fontSize: 12,
      lineSpacing: 1.25,
      margin: { top: 14, right: 14, bottom: 14, left: 14 },
      sectionSpacing: 4,
    },
  },
  soe: {
    label: '国企/事业单位',
    config: {
      fontScheme: 'songti',
      fontSize: 16,
      lineSpacing: 1.5,
      infoLayout: 'grid',
      avatarStyle: 'oneInch',
    },
  },
  foreign: {
    label: '外企英文',
    config: {
      fontScheme: 'latin-arial',
      fontSize: 14,
      lineSpacing: 1.3,
      avatarStyle: 'circle',
    },
  },
  'accent-blue': {
    label: '深蓝点缀',
    config: { primaryColor: '#1f3a5f', accentColor: '#1f3a5f' },
  },
};

export function buildThemeCss(
  scopeSelector: string,
  theme: ResolvedTheme,
  options: { export?: boolean } = {},
) {
  const fs = resolveCssFontScale(theme.fontSize);
  const unit = options.export ? 'mm' : 'mm';
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
      `padding: ${m.top}${unit} ${m.right}${unit} ${m.bottom}${unit} ${m.left}${unit} !important; ` +
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

export const DEFAULT_THEME = BASE_THEME;
