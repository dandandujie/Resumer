import { CJK_FONTS, LATIN_FONTS } from '@/lib/theme-config';
import type { ResolvedTheme } from '@/types/resume';

const BUNDLED_NAMES: Record<string, string> = {
  'Reseumer Hei': 'Noto Sans SC',
  'Reseumer Song': 'Noto Serif CJK SC',
  'Reseumer Kai': 'LXGW WenKai Lite',
};

/** 按预览的 CSS 顺序寻找本机字体，避免 Word 写入一个预览实际未使用的首选字体名。 */
export async function resolveAvailableFont(
  stack: string,
  fallback: string,
  available: (family: string) => Promise<boolean> = localFontAvailable,
): Promise<string> {
  for (const token of stack.split(',')) {
    const family = token.trim().replace(/^['"]|['"]$/g, '');
    if (BUNDLED_NAMES[family]) return BUNDLED_NAMES[family];
    if (await available(family)) return family;
  }
  return fallback;
}

const LOCAL_ALIASES: Record<string, string[]> = {
  'PingFang SC': ['PingFangSC-Regular'],
  'Songti SC': ['Songti SC Regular', 'SongtiSC-Regular'],
  'Heiti SC': ['Heiti SC Light', 'STHeitiSC-Light'],
  'Kaiti SC': ['Kaiti SC Regular', 'KaitiSC-Regular'],
};

async function localFontAvailable(family: string): Promise<boolean> {
  // document.fonts.check 对不存在的字体也可能返回 true，必须实际加载 local 字体源。
  for (const name of [family, ...(LOCAL_ALIASES[family] || [])]) {
    try {
      await new FontFace('resumer-export-probe', `local(${JSON.stringify(name)})`).load();
      return true;
    } catch {
      // macOS 的 local() 有时只接受字体全名或 PostScript 名，而 CSS 接受族名。
    }
  }
  return false;
}

export async function resolveExportOfficeFonts(theme: Pick<ResolvedTheme, 'fontScheme' | 'latinFont'>) {
  const resolveTable = async (table: typeof CJK_FONTS | typeof LATIN_FONTS) =>
    Object.fromEntries(await Promise.all(Object.entries(table).map(async ([id, font]) =>
      [id, await resolveAvailableFont(font.screen, font.office)])));
  const [cjkFontNames, latinFontNames] = await Promise.all([
    resolveTable(CJK_FONTS), resolveTable(LATIN_FONTS),
  ]);
  return {
    officeFonts: { eastAsia: cjkFontNames[theme.fontScheme], latin: latinFontNames[theme.latinFont] },
    cjkFontNames,
    latinFontNames,
  };
}
