import type { ThemeConfig, ThemeFontSize, ResolvedTheme } from '@/types/resume';

export const BASE_THEME_FONT_SIZE = 14;
export const MIN_THEME_FONT_SIZE = 10;
export const MAX_THEME_FONT_SIZE = 20;
export const MAX_PAGE_MARGIN_MM = 40;
/** CSS 参考像素：1mm = 96 / 25.4 px，预览与页数预估都用它换算页边距。 */
export const PX_PER_MM = 96 / 25.4;

/** 中文字体 id。旧的 `latin-*` 配对方案在 resolveTheme 里迁移成 中文字体 + 西文字体 两个字段。 */
export type FontSchemeId =
  | 'yahei'
  | 'sourcehan-sans'
  | 'songti'
  | 'sourcehan-serif'
  | 'stzhongsong'
  | 'heiti'
  | 'kaiti'
  | 'fangsong';
export type LatinFontId = 'calibri' | 'aptos' | 'times' | 'arial';
export type DateStyle = 'dot' | 'dash' | 'cn';
export type HeadingStyle = 'underline' | 'plain' | 'filled';

interface FontEntry {
  /** 屏幕优先系统字体，导出优先内置字体（PDF 可嵌入、离线一致）。 */
  screen: string;
  export: string;
  /** Office/WPS 认识的字体名 */
  office: string;
}

/**
 * 中文字体表。思源黑体/思源宋体就是内置的 Reseumer Hei/Song（Noto Sans/Serif SC），
 * 预览与 PDF 完全一致；其余字体依赖系统安装，缺失时退回对应的内置字体。
 * DOCX 导出把 office 名传给 Rust，Rust 侧不再维护第二份映射。
 */
export const CJK_FONTS: Record<FontSchemeId, FontEntry> = {
  yahei: {
    screen: "'Microsoft YaHei', 'PingFang SC', 'Reseumer Hei'",
    export: "'Reseumer Hei', 'Microsoft YaHei', 'PingFang SC'",
    office: '微软雅黑',
  },
  'sourcehan-sans': {
    screen: "'Reseumer Hei', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC'",
    export: "'Reseumer Hei', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC'",
    office: '思源黑体 CN',
  },
  songti: {
    screen: "'SimSun', 'Songti SC', 'Reseumer Song'",
    export: "'Reseumer Song', 'SimSun', 'Songti SC'",
    office: '宋体',
  },
  'sourcehan-serif': {
    screen: "'Reseumer Song', 'Source Han Serif SC', 'Noto Serif CJK SC', 'Noto Serif SC'",
    export: "'Reseumer Song', 'Source Han Serif SC', 'Noto Serif CJK SC', 'Noto Serif SC'",
    office: '思源宋体 CN',
  },
  stzhongsong: {
    screen: "'STZhongsong', 'Songti SC', 'SimSun', 'Reseumer Song'",
    export: "'STZhongsong', 'Reseumer Song', 'Songti SC', 'SimSun'",
    office: '华文中宋',
  },
  heiti: {
    screen: "'SimHei', 'Heiti SC', 'Microsoft YaHei', 'Reseumer Hei'",
    export: "'Reseumer Hei', 'SimHei', 'Heiti SC'",
    office: '黑体',
  },
  kaiti: {
    screen: "'KaiTi', 'Kaiti SC', 'Reseumer Kai'",
    export: "'Reseumer Kai', 'KaiTi', 'Kaiti SC'",
    office: '楷体',
  },
  fangsong: {
    screen: "'FangSong', 'STFangsong', 'Reseumer Song'",
    export: "'Reseumer Song', 'FangSong', 'STFangsong'",
    office: '仿宋',
  },
};

/** 西文字体表。CSS 里放在中文字体前面：拉丁字符先命中西文字体，汉字落到中文字体。 */
export const LATIN_FONTS: Record<LatinFontId, FontEntry> = {
  calibri: { screen: "Calibri, Carlito", export: "Calibri, Carlito", office: 'Calibri' },
  aptos: { screen: "Aptos, 'Segoe UI', Calibri", export: "Aptos, 'Segoe UI', Calibri", office: 'Aptos' },
  times: { screen: "'Times New Roman', 'Liberation Serif'", export: "'Times New Roman', 'Liberation Serif'", office: 'Times New Roman' },
  arial: { screen: "Arial, 'Liberation Sans'", export: "Arial, 'Liberation Sans'", office: 'Arial' },
};

/** 中文字体默认搭配的西文字体（黑体系配无衬线，宋体系配 Times）。 */
export const DEFAULT_LATIN_FOR: Record<FontSchemeId, LatinFontId> = {
  yahei: 'calibri',
  'sourcehan-sans': 'calibri',
  songti: 'times',
  'sourcehan-serif': 'times',
  stzhongsong: 'times',
  heiti: 'arial',
  kaiti: 'times',
  fangsong: 'times',
};

/** 旧的中英配对方案 id → 新的两个字段 */
const LEGACY_SCHEME_MAP: Record<string, { fontScheme: FontSchemeId; latinFont: LatinFontId }> = {
  'latin-arial': { fontScheme: 'yahei', latinFont: 'arial' },
  'latin-times': { fontScheme: 'songti', latinFont: 'times' },
  'latin-calibri': { fontScheme: 'yahei', latinFont: 'calibri' },
};

export function isFontSchemeId(value: unknown): value is FontSchemeId {
  return typeof value === 'string' && value in CJK_FONTS;
}
export function isLatinFontId(value: unknown): value is LatinFontId {
  return typeof value === 'string' && value in LATIN_FONTS;
}

/** 唯一默认主题。预览、导出、导入基底、预设都从这里派生。 */
export const DEFAULT_THEME: ResolvedTheme = {
  fontScheme: 'yahei',
  latinFont: 'calibri',
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

function resolveFonts(value: Partial<ThemeConfig>): { fontScheme: FontSchemeId; latinFont: LatinFontId } {
  const legacyScheme = typeof value.fontScheme === 'string' ? LEGACY_SCHEME_MAP[value.fontScheme] : undefined;
  const legacyFamily = value.fontFamily ? LEGACY_FONT_MAP[value.fontFamily] : undefined;
  const fontScheme = isFontSchemeId(value.fontScheme)
    ? value.fontScheme
    : legacyScheme?.fontScheme || legacyFamily || DEFAULT_THEME.fontScheme;
  const latinFont = isLatinFontId(value.latinFont)
    ? value.latinFont
    : legacyScheme?.latinFont || DEFAULT_LATIN_FOR[fontScheme];
  return { fontScheme, latinFont };
}

export function resolveTheme(raw?: Partial<ThemeConfig> | null): ResolvedTheme {
  const value = raw || {};
  return {
    ...DEFAULT_THEME,
    ...value,
    ...resolveFonts(value),
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
export function resolveScreenFontStack(theme: Pick<ResolvedTheme, 'fontScheme' | 'latinFont'>) {
  return `${LATIN_FONTS[theme.latinFont].screen}, ${CJK_FONTS[theme.fontScheme].screen}, sans-serif`;
}
export function resolveExportFontStack(theme: Pick<ResolvedTheme, 'fontScheme' | 'latinFont'>) {
  return `${LATIN_FONTS[theme.latinFont].export}, ${CJK_FONTS[theme.fontScheme].export}, sans-serif`;
}
export function resolveOfficeFonts(theme: Pick<ResolvedTheme, 'fontScheme' | 'latinFont'>) {
  return { eastAsia: CJK_FONTS[theme.fontScheme].office, latin: LATIN_FONTS[theme.latinFont].office };
}
/** 内联标记 `{{font=<id>}}` 用到的 Office 中文字体名表，随 DOCX 主题一起传给 Rust。 */
export function cjkOfficeFontNames(): Record<FontSchemeId, string> {
  return Object.fromEntries(
    (Object.keys(CJK_FONTS) as FontSchemeId[]).map((id) => [id, CJK_FONTS[id].office]),
  ) as Record<FontSchemeId, string>;
}

/**
 * 预设是完整主题：套用即整体替换，不会残留上一预设的字段。
 * 显示名走 i18n 键 `themeEditor.presetLabels.<id>`。
 */
export const THEME_PRESETS: Record<string, ResolvedTheme> = {
  standard: DEFAULT_THEME,
  'songti-classic': { ...DEFAULT_THEME, fontScheme: 'songti', latinFont: 'times', lineSpacing: 1.3 },
  compact: {
    ...DEFAULT_THEME,
    fontScheme: 'sourcehan-sans',
    latinFont: 'arial',
    fontSize: 12,
    lineSpacing: 1.25,
    margin: { top: 14, right: 14, bottom: 14, left: 14 },
    sectionSpacing: 4,
  },
  soe: {
    ...DEFAULT_THEME,
    fontScheme: 'songti',
    latinFont: 'times',
    fontSize: 16,
    lineSpacing: 1.5,
    infoLayout: 'grid',
    avatarStyle: 'oneInch',
  },
  foreign: {
    ...DEFAULT_THEME,
    fontScheme: 'yahei',
    latinFont: 'arial',
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
  const fontFamily = options.export ? resolveExportFontStack(theme) : resolveScreenFontStack(theme);
  return [
    `${scopeSelector} > div { font-family: ${fontFamily} !important; line-height: ${theme.lineSpacing} !important; ` +
      `padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm !important; ` +
      `--base-body-size:${fs.body}; --base-h1-size:${fs.h1}; --base-h2-size:${fs.h2}; ` +
      `--base-h3-size:${fs.h3}; --base-line-spacing:${theme.lineSpacing}; ` +
      `--base-section-spacing:${theme.sectionSpacing}px; --resume-body-color:${theme.bodyColor}; ` +
      `--resume-primary-color:${theme.primaryColor}; --resume-accent-color:${theme.accentColor}; }`,
    // span[data-fmt] 是选区级标记生成的，它自己的字号/颜色/字体要能覆盖正文规则
    `${scopeSelector} p, ${scopeSelector} li, ${scopeSelector} span:not([data-fmt]), ${scopeSelector} td, ` +
      `${scopeSelector} a, ${scopeSelector} div { font-size:${fs.body} !important; ` +
      `line-height:${theme.lineSpacing} !important; color:var(--resume-body-color); }`,
    `${scopeSelector} span[data-fmt] { line-height:${theme.lineSpacing}; }`,
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
