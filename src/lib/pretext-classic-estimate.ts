import { isSectionEmpty } from '@/components/preview/utils';
import {
  PX_PER_MM,
  resolveCssFontScale,
  resolveScreenFontStack,
  resolveThemeFontSize,
  resolveTheme,
} from '@/lib/theme-config';
import type {
  CertificationsContent,
  CustomContent,
  EducationContent,
  GitHubContent,
  LanguagesContent,
  PersonalInfoContent,
  ProjectsContent,
  Resume,
  SkillsContent,
  SummaryContent,
  ThemeConfig,
  WorkExperienceContent,
} from '@/types/resume';

type PretextModule = typeof import('@chenglou/pretext');

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const AVATAR_SIZE = 64;
const HEADER_BOTTOM_MARGIN = 24;
const HEADER_BOTTOM_PADDING = 16;
const HEADER_CONTACT_MARGIN_TOP = 8;
const HEADER_GAP = 16;
const CONTACT_GAP = 12;
const CONTACT_ROW_GAP = 12;
const SECTION_TITLE_MARGIN_BOTTOM = 8;
const SECTION_TITLE_PADDING_BOTTOM = 4;
const SECTION_ROW_GAP_SM = 4;
const SECTION_ROW_GAP_MD = 8;
const SECTION_ROW_GAP_LG = 12;
const LIST_INDENT = 24;
const LIST_BLOCK_MARGIN = 4;
const GRID_GAP = 24;
const COMPANY_COLUMN_WIDTH = 140;
const DATE_COLUMN_WIDTH = 120;
const QR_TILE_HEIGHT = 112;
const QR_TILE_WIDTH = 96;
const QR_GAP = 12;

export interface ClassicPageEstimate {
  totalHeight: number;
  pageHeight: number;
  pageCount: number;
  overflowSections: string[];
}

type PrepareOptions = Parameters<PretextModule['prepareWithSegments']>[2];

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

type MeasureApi = ReturnType<typeof createMeasure>;

function clamp(value: number, min: number) {
  return Number.isFinite(value) ? Math.max(value, min) : min;
}

function stripMarkdown(text: unknown): string {
  if (text == null) return '';
  return String(text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function parseMarkdownBlocks(text: unknown): MarkdownBlock[] {
  const source = stripMarkdown(text);
  if (!source.trim()) return [];

  const blocks: MarkdownBlock[] = [];
  const lines = source.split('\n');
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = line.match(/^[-–•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function font(weight: number, size: number, family: string) {
  return `${weight} ${Math.round(size)}px ${family}`;
}

function createMeasure(pretext: PretextModule) {
  const cache = new Map<string, ReturnType<PretextModule['prepareWithSegments']>>();

  const getPrepared = (text: unknown, fontValue: string, options?: PrepareOptions) => {
    const source = stripMarkdown(text);
    const key = JSON.stringify([
      source,
      fontValue,
      options?.whiteSpace ?? 'normal',
      options?.wordBreak ?? 'normal',
    ]);

    let prepared = cache.get(key);
    if (!prepared) {
      prepared = pretext.prepareWithSegments(source, fontValue, options);
      cache.set(key, prepared);
    }
    return prepared;
  };

  return {
    height(
      text: unknown,
      fontValue: string,
      width: number,
      lineHeight: number,
      options?: PrepareOptions,
    ) {
      const source = stripMarkdown(text);
      if (!source.trim()) return 0;
      const prepared = getPrepared(source, fontValue, options);
      const { lineCount } = pretext.measureLineStats(prepared, Math.max(1, width));
      return lineCount * lineHeight;
    },

    width(text: unknown, fontValue: string, options?: PrepareOptions) {
      const source = stripMarkdown(text);
      if (!source.trim()) return 0;
      const prepared = getPrepared(source, fontValue, options);
      return pretext.measureNaturalWidth(prepared);
    },
  };
}

function estimateWrappedInlineHeight(
  measure: MeasureApi,
  parts: Array<{ text?: string; fontValue: string; lineHeight: number }>,
  width: number,
) {
  const active = parts.filter((part) => part.text && stripMarkdown(part.text).trim());
  if (active.length === 0) return 0;

  const totalWidth = active.reduce((sum, part) => sum + measure.width(part.text, part.fontValue), 0);
  const maxLineHeight = Math.max(...active.map((part) => part.lineHeight));

  if (totalWidth <= width) {
    return maxLineHeight;
  }

  return active.reduce((sum, part) => {
    return sum + measure.height(part.text, part.fontValue, width, part.lineHeight, { whiteSpace: 'pre-wrap' });
  }, 0);
}

function estimateFlexWrapHeight(
  measure: MeasureApi,
  items: string[],
  fontValue: string,
  maxWidth: number,
  lineHeight: number,
  gap: number,
  rowGap: number,
) {
  if (items.length === 0) return 0;

  let rows = 1;
  let currentWidth = 0;

  for (const item of items) {
    const itemWidth = measure.width(item, fontValue);
    if (currentWidth === 0) {
      currentWidth = itemWidth;
      continue;
    }

    if (currentWidth + gap + itemWidth <= maxWidth) {
      currentWidth += gap + itemWidth;
    } else {
      rows += 1;
      currentWidth = itemWidth;
    }
  }

  return rows * lineHeight + Math.max(0, rows - 1) * rowGap;
}

function estimateMarkdownHeight(
  measure: MeasureApi,
  text: unknown,
  fontValue: string,
  width: number,
  lineHeight: number,
): number {
  const blocks = parseMarkdownBlocks(text);
  if (blocks.length === 0) return 0;

  return blocks.reduce((sum, block) => {
    if (block.type === 'paragraph') {
      return sum + measure.height(block.text, fontValue, width, lineHeight, { whiteSpace: 'pre-wrap' });
    }

    const listHeight = block.items.reduce((listSum: number, item): number => {
      return listSum + estimateMarkdownHeight(measure, item, fontValue, Math.max(100, width - LIST_INDENT), lineHeight);
    }, 0);

    return sum + LIST_BLOCK_MARGIN + listHeight;
  }, 0);
}

function estimateHeaderHeight(
  measure: MeasureApi,
  resume: Resume,
  contentWidth: number,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  h1Size: number,
  h1LineHeight: number,
) {
  const personalInfo = resume.sections.find((section) => section.type === 'personal_info');
  const info = (personalInfo?.content || {}) as PersonalInfoContent;
  const titleWidth = info.avatar ? Math.max(160, contentWidth - AVATAR_SIZE - HEADER_GAP) : contentWidth;

  const nameHeight = measure.height(
    info.fullName || 'Your Name',
    font(700, h1Size, family),
    titleWidth,
    h1LineHeight,
  );
  const jobHeight = info.jobTitle
    ? measure.height(info.jobTitle, font(400, bodySize, family), titleWidth, bodyLineHeight)
    : 0;

  const titleBlockHeight = nameHeight + (jobHeight > 0 ? SECTION_ROW_GAP_SM + jobHeight : 0);
  const rowHeight = info.avatar ? Math.max(AVATAR_SIZE, titleBlockHeight) : titleBlockHeight;

  const contacts = [
    info.age,
    info.politicalStatus,
    info.gender,
    info.ethnicity,
    info.hometown,
    info.maritalStatus,
    info.yearsOfExperience,
    info.educationLevel,
    info.email,
    info.phone,
    info.wechat,
    info.location,
    info.website,
  ].filter(Boolean) as string[];

  const contactsHeight = contacts.length
    ? estimateFlexWrapHeight(
        measure,
        contacts,
        font(400, bodySize, family),
        contentWidth,
        bodyLineHeight,
        CONTACT_GAP,
        CONTACT_ROW_GAP,
      )
    : 0;

  return rowHeight + HEADER_BOTTOM_PADDING + HEADER_BOTTOM_MARGIN + (contactsHeight ? HEADER_CONTACT_MARGIN_TOP + contactsHeight : 0);
}

function estimateHighlights(
  measure: MeasureApi,
  highlights: string[] | undefined,
  fontValue: string,
  lineHeight: number,
  contentWidth: number,
) {
  if (!highlights?.length) return 0;
  const itemWidth = Math.max(120, contentWidth - LIST_INDENT);
  return highlights.reduce((sum, highlight) => {
    return sum + estimateMarkdownHeight(measure, highlight, fontValue, itemWidth, lineHeight);
  }, 0);
}

function estimateWorkHeight(
  measure: MeasureApi,
  content: WorkExperienceContent,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  contentWidth: number,
) {
  const leftWidth = Math.max(180, contentWidth - COMPANY_COLUMN_WIDTH - DATE_COLUMN_WIDTH - GRID_GAP);
  const companyWidth = COMPANY_COLUMN_WIDTH;
  const dateWidth = DATE_COLUMN_WIDTH;
  const strongFont = font(600, bodySize, family);
  const bodyFont = font(400, bodySize, family);

  return (content.items || []).reduce((sum, item, index) => {
    const positionHeight = measure.height(item.position, strongFont, leftWidth, bodyLineHeight);
    const companyHeight = item.company ? measure.height(item.company, strongFont, companyWidth, bodyLineHeight) : 0;
    const locationHeight = item.location ? measure.height(item.location, bodyFont, companyWidth, bodyLineHeight) : 0;
    const dateText = [item.startDate, item.endDate || (item.current ? 'Present' : '')].filter(Boolean).join(' - ');
    const dateHeight = dateText ? measure.height(dateText, strongFont, dateWidth, bodyLineHeight) : 0;
    const companyBlockHeight = companyHeight + (locationHeight > 0 ? locationHeight : 0);
    const headerHeight = Math.max(positionHeight, companyBlockHeight, dateHeight, bodyLineHeight);

    const descriptionHeight = item.description
      ? SECTION_ROW_GAP_SM + estimateMarkdownHeight(measure, item.description, bodyFont, contentWidth, bodyLineHeight)
      : 0;
    const techHeight = item.technologies?.length
      ? SECTION_ROW_GAP_SM / 2 + measure.height(`Tech: ${item.technologies.join(', ')}`, bodyFont, contentWidth, bodyLineHeight)
      : 0;
    const highlightsHeight = item.highlights?.length
      ? SECTION_ROW_GAP_SM + estimateHighlights(measure, item.highlights, bodyFont, bodyLineHeight, contentWidth)
      : 0;

    return sum + headerHeight + descriptionHeight + techHeight + highlightsHeight + (index > 0 ? SECTION_ROW_GAP_LG : 0);
  }, 0);
}

function estimateEducationHeight(
  measure: MeasureApi,
  content: EducationContent,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  contentWidth: number,
) {
  const titleWidth = Math.max(220, contentWidth - DATE_COLUMN_WIDTH - SECTION_ROW_GAP_LG);
  const strongFont = font(600, bodySize, family);
  const bodyFont = font(400, bodySize, family);

  return (content.items || []).reduce((sum, item, index) => {
    const titleHeight = estimateWrappedInlineHeight(
      measure,
      [
        { text: [item.institution, item.field, item.degree].filter(Boolean).join(' - '), fontValue: strongFont, lineHeight: bodyLineHeight },
        { text: item.location ? ` , ${item.location}` : '', fontValue: bodyFont, lineHeight: bodyLineHeight },
      ],
      titleWidth,
    );
    const dateText = [item.startDate, item.endDate].filter(Boolean).join(' - ');
    const dateHeight = dateText ? measure.height(dateText, strongFont, DATE_COLUMN_WIDTH, bodyLineHeight) : 0;
    const headerHeight = Math.max(titleHeight, dateHeight, bodyLineHeight);
    const gpaHeight = item.gpa ? SECTION_ROW_GAP_SM + measure.height(`GPA: ${item.gpa}`, bodyFont, contentWidth, bodyLineHeight) : 0;
    const highlightsHeight = item.highlights?.length
      ? SECTION_ROW_GAP_SM + estimateHighlights(measure, item.highlights, bodyFont, bodyLineHeight, contentWidth)
      : 0;

    return sum + headerHeight + gpaHeight + highlightsHeight + (index > 0 ? SECTION_ROW_GAP_LG : 0);
  }, 0);
}

function estimateSkillsHeight(
  measure: MeasureApi,
  content: SkillsContent,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  contentWidth: number,
) {
  const labelWidth = 112;
  const valueWidth = Math.max(120, contentWidth - labelWidth - SECTION_ROW_GAP_SM);
  const bodyFont = font(400, bodySize, family);

  return (content.categories || []).reduce((sum, category, index) => {
    const valueHeight = measure.height((category.skills || []).join(', '), bodyFont, valueWidth, bodyLineHeight);
    return sum + Math.max(bodyLineHeight, valueHeight) + (index > 0 ? SECTION_ROW_GAP_SM : 0);
  }, 0);
}

function estimateProjectsHeight(
  measure: MeasureApi,
  content: ProjectsContent,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  contentWidth: number,
) {
  const titleWidth = Math.max(220, contentWidth - DATE_COLUMN_WIDTH - SECTION_ROW_GAP_LG);
  const strongFont = font(600, bodySize, family);
  const bodyFont = font(400, bodySize, family);

  return (content.items || []).reduce((sum, item, index) => {
    const titleHeight = measure.height(item.name, strongFont, titleWidth, bodyLineHeight);
    const dateText = [item.startDate, item.endDate].filter(Boolean).join(' - ');
    const dateHeight = dateText ? measure.height(dateText, strongFont, DATE_COLUMN_WIDTH, bodyLineHeight) : 0;
    const headerHeight = Math.max(titleHeight, dateHeight, bodyLineHeight);
    const descriptionHeight = item.description
      ? SECTION_ROW_GAP_SM + estimateMarkdownHeight(measure, item.description, bodyFont, contentWidth, bodyLineHeight)
      : 0;
    const techHeight = item.technologies?.length
      ? SECTION_ROW_GAP_SM / 2 + measure.height(`Tech: ${item.technologies.join(', ')}`, bodyFont, contentWidth, bodyLineHeight)
      : 0;
    const highlightsHeight = item.highlights?.length
      ? SECTION_ROW_GAP_SM + estimateHighlights(measure, item.highlights, bodyFont, bodyLineHeight, contentWidth)
      : 0;

    return sum + headerHeight + descriptionHeight + techHeight + highlightsHeight + (index > 0 ? SECTION_ROW_GAP_LG : 0);
  }, 0);
}

function estimateGitHubHeight(
  measure: MeasureApi,
  content: GitHubContent,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  contentWidth: number,
) {
  const titleWidth = Math.max(220, contentWidth - 80 - SECTION_ROW_GAP_MD);
  const strongFont = font(600, bodySize, family);
  const bodyFont = font(400, bodySize, family);

  return (content.items || []).reduce((sum, item, index) => {
    const titleHeight = measure.height(item.name, strongFont, titleWidth, bodyLineHeight);
    const starHeight = measure.height(String(item.stars || 0), bodyFont, 80, bodyLineHeight);
    const languageHeight = item.language ? SECTION_ROW_GAP_SM / 2 + measure.height(item.language, bodyFont, contentWidth, bodyLineHeight) : 0;
    const descriptionHeight = item.description
      ? SECTION_ROW_GAP_SM + estimateMarkdownHeight(measure, item.description, bodyFont, contentWidth, bodyLineHeight)
      : 0;

    return sum + Math.max(titleHeight, starHeight, bodyLineHeight) + languageHeight + descriptionHeight + (index > 0 ? SECTION_ROW_GAP_LG : 0);
  }, 0);
}

function estimateSimpleItemsHeight(
  measure: MeasureApi,
  items: Array<{
    name?: string;
    language?: string;
    proficiency?: string;
    issuer?: string;
    date?: string;
    description?: string;
    title?: string;
    subtitle?: string;
  }>,
  family: string,
  bodySize: number,
  bodyLineHeight: number,
  contentWidth: number,
  gap: number,
) {
  const strongFont = font(600, bodySize, family);
  const bodyFont = font(400, bodySize, family);

  return items.reduce((sum, item, index) => {
    const lineHeight = estimateWrappedInlineHeight(
      measure,
      [
        { text: item.name || item.title || item.language || '', fontValue: strongFont, lineHeight: bodyLineHeight },
        { text: item.proficiency ? ` — ${item.proficiency}` : '', fontValue: bodyFont, lineHeight: bodyLineHeight },
        { text: item.issuer ? ` — ${item.issuer}` : '', fontValue: bodyFont, lineHeight: bodyLineHeight },
        { text: item.date ? ` (${item.date})` : '', fontValue: bodyFont, lineHeight: bodyLineHeight },
        { text: item.subtitle ? ` — ${item.subtitle}` : '', fontValue: bodyFont, lineHeight: bodyLineHeight },
      ],
      contentWidth,
    );

    const descriptionHeight = item.description
      ? SECTION_ROW_GAP_SM + estimateMarkdownHeight(measure, item.description, bodyFont, contentWidth, bodyLineHeight)
      : 0;

    return sum + Math.max(lineHeight, bodyLineHeight) + descriptionHeight + (index > 0 ? gap : 0);
  }, 0);
}

function estimateQrHeight(itemCount: number, contentWidth: number) {
  if (itemCount <= 0) return 0;
  const cols = Math.max(1, Math.floor((contentWidth + QR_GAP) / (QR_TILE_WIDTH + QR_GAP)));
  const rows = Math.ceil(itemCount / cols);
  return rows * QR_TILE_HEIGHT + Math.max(0, rows - 1) * QR_GAP;
}

export function estimateClassicPages(pretext: PretextModule, resume: Resume): ClassicPageEstimate {
  const theme = resolveTheme(resume.themeConfig);
  // 主题边距是 mm，估算画布是 px。
  const marginPx = {
    top: theme.margin.top * PX_PER_MM,
    right: theme.margin.right * PX_PER_MM,
    bottom: theme.margin.bottom * PX_PER_MM,
    left: theme.margin.left * PX_PER_MM,
  };
  const fontScale = resolveCssFontScale(theme.fontSize);
  const bodySize = resolveThemeFontSize(theme.fontSize);
  const family = resolveScreenFontStack(theme);
  const bodyLineHeight = clamp(bodySize * theme.lineSpacing, bodySize);
  const h1Size = parseFloat(fontScale.h1);
  const h2Size = parseFloat(fontScale.h2);
  const h1LineHeight = clamp(h1Size * theme.lineSpacing, h1Size);
  const h2LineHeight = clamp(h2Size * theme.lineSpacing, h2Size);
  const contentWidth = Math.max(220, A4_WIDTH - marginPx.left - marginPx.right);
  const measure = createMeasure(pretext);

  let totalHeight = marginPx.top + marginPx.bottom;
  totalHeight += estimateHeaderHeight(
    measure,
    { ...resume, themeConfig: theme },
    contentWidth,
    family,
    bodySize,
    bodyLineHeight,
    h1Size,
    h1LineHeight,
  );

  const overflowSections: string[] = [];
  const sections = resume.sections.filter(
    (section) => section.visible && section.type !== 'personal_info' && !isSectionEmpty(section)
  );

  for (const section of sections) {
    let contentHeight: number;

    if (section.type === 'summary') {
      const summary = section.content as SummaryContent;
      contentHeight = estimateMarkdownHeight(
        measure,
        summary.text,
        font(400, bodySize, family),
        contentWidth,
        bodyLineHeight,
      );
    } else if (section.type === 'work_experience') {
      contentHeight = estimateWorkHeight(measure, section.content as WorkExperienceContent, family, bodySize, bodyLineHeight, contentWidth);
    } else if (section.type === 'education') {
      contentHeight = estimateEducationHeight(measure, section.content as EducationContent, family, bodySize, bodyLineHeight, contentWidth);
    } else if (section.type === 'skills') {
      contentHeight = estimateSkillsHeight(measure, section.content as SkillsContent, family, bodySize, bodyLineHeight, contentWidth);
    } else if (section.type === 'projects') {
      contentHeight = estimateProjectsHeight(measure, section.content as ProjectsContent, family, bodySize, bodyLineHeight, contentWidth);
    } else if (section.type === 'github') {
      contentHeight = estimateGitHubHeight(measure, section.content as GitHubContent, family, bodySize, bodyLineHeight, contentWidth);
    } else if (section.type === 'certifications') {
      contentHeight = estimateSimpleItemsHeight(
        measure,
        (section.content as CertificationsContent).items || [],
        family,
        bodySize,
        bodyLineHeight,
        contentWidth,
        SECTION_ROW_GAP_SM,
      );
    } else if (section.type === 'languages') {
      contentHeight = estimateSimpleItemsHeight(
        measure,
        (section.content as LanguagesContent).items || [],
        family,
        bodySize,
        bodyLineHeight,
        contentWidth,
        SECTION_ROW_GAP_SM,
      );
    } else if (section.type === 'custom') {
      contentHeight = estimateSimpleItemsHeight(
        measure,
        (section.content as CustomContent).items || [],
        family,
        bodySize,
        bodyLineHeight,
        contentWidth,
        SECTION_ROW_GAP_MD,
      );
    } else if (section.type === 'qr_codes') {
      contentHeight = estimateQrHeight(((section.content as any).items || []).length, contentWidth);
    } else {
      const generic = ((section.content as any)?.items || []).map((item: any) => ({
        name: item.name || item.title || item.language,
        description: item.description,
      }));
      contentHeight = estimateSimpleItemsHeight(
        measure,
        generic,
        family,
        bodySize,
        bodyLineHeight,
        contentWidth,
        SECTION_ROW_GAP_MD,
      );
    }

    const sectionHeight =
      h2LineHeight
      + SECTION_TITLE_MARGIN_BOTTOM
      + SECTION_TITLE_PADDING_BOTTOM
      + contentHeight
      + theme.sectionSpacing;

    const previousHeight = totalHeight;
    totalHeight += sectionHeight;

    if (previousHeight < A4_HEIGHT && totalHeight > A4_HEIGHT) {
      overflowSections.push(section.title);
    } else if (previousHeight >= A4_HEIGHT) {
      overflowSections.push(section.title);
    }
  }

  return {
    totalHeight,
    pageHeight: A4_HEIGHT,
    pageCount: Math.max(1, Math.ceil(totalHeight / A4_HEIGHT)),
    overflowSections,
  };
}

/**
 * Smart layout algorithm: uses Pretext's fast calculation to perform a binary search.
 * Finds the maximum base font size that fits the content within a single A4 page.
 */
export function calculateOptimalFit(pretext: PretextModule, resume: Resume): ThemeConfig | null {
  const A4_MAX_CONTENT_HEIGHT = 1123;
  const MIN_FONT_SIZE = 12;
  const MAX_FONT_SIZE = 16;
  const TOLERANCE = 0.1;

  let low = MIN_FONT_SIZE;
  let high = MAX_FONT_SIZE;
  let optimalSize: number | null = null;
  
  const testResume = JSON.parse(JSON.stringify(resume)) as Resume;
  // 从 DB 读出的 themeConfig 可能仍是 JSON 字符串；解析后统一走 resolveTheme 补默认值与迁移单位。
  const rawTheme: unknown = testResume.themeConfig;
  const parsedTheme = ((): ThemeConfig | null => {
    if (typeof rawTheme !== 'string') return (rawTheme as ThemeConfig | undefined) ?? null;
    try {
      return JSON.parse(rawTheme) as ThemeConfig;
    } catch {
      return null;
    }
  })();
  testResume.themeConfig = resolveTheme(parsedTheme);

  // First check if it fits with max font size
  testResume.themeConfig.fontSize = MAX_FONT_SIZE;
  if (estimateClassicPages(pretext, testResume).totalHeight <= A4_MAX_CONTENT_HEIGHT) {
    return { ...testResume.themeConfig, fontSize: MAX_FONT_SIZE };
  }

  // Then check if it even fits with min font size
  testResume.themeConfig.fontSize = MIN_FONT_SIZE;
  if (estimateClassicPages(pretext, testResume).totalHeight > A4_MAX_CONTENT_HEIGHT) {
    return null; // Cannot fit in one page even with minimum font
  }

  // Binary search for the optimal font size
  while (high - low > TOLERANCE) {
    const mid = (low + high) / 2;
    testResume.themeConfig.fontSize = mid;

    const estimate = estimateClassicPages(pretext, testResume);

    if (estimate.totalHeight <= A4_MAX_CONTENT_HEIGHT) {
      optimalSize = mid;
      low = mid; 
    } else {
      high = mid; 
    }
  }

  if (!optimalSize) return null;

  return {
    ...testResume.themeConfig,
    fontSize: optimalSize,
  };
}
