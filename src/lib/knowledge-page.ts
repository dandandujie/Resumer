/**
 * purpose.md 的表单化读写。文件格式固定为中文二级标题（它是知识库的存储约定，与界面语言无关）；
 * 界面标签走 i18n。
 */

export interface PurposeFields {
  role: string;
  city: string;
  industry: string;
  constraints: string;
  other: string;
}

export const PURPOSE_HEADINGS: Record<keyof PurposeFields, string> = {
  role: '目标岗位',
  city: '期望城市',
  industry: '目标行业',
  constraints: '硬约束',
  other: '其他',
};

export const EMPTY_PURPOSE: PurposeFields = { role: '', city: '', industry: '', constraints: '', other: '' };

export function parsePurpose(markdown: string): PurposeFields {
  const text = markdown.replace(/\r\n/g, '\n');
  const result = { ...EMPTY_PURPOSE };
  for (const key of Object.keys(PURPOSE_HEADINGS) as (keyof PurposeFields)[]) {
    const heading = PURPOSE_HEADINGS[key];
    const match = text.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'));
    result[key] = match?.[1]?.trim() ?? '';
  }
  return result;
}

export function serializePurpose(fields: PurposeFields): string {
  const sections = (Object.keys(PURPOSE_HEADINGS) as (keyof PurposeFields)[])
    .map((key) => `## ${PURPOSE_HEADINGS[key]}\n${fields[key].trim()}\n`)
    .join('\n');
  return `# 求职目标\n\n${sections}`;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/** 阅读态只显示正文；元信息在右栏单独展示。 */
export function stripFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER, '');
}

export const WIKILINK_SCHEME = 'wiki:';

/** `[[wiki/companies/a.md|字节]]` → `[字节](wiki:wiki/companies/a.md)`，交给 Markdown 渲染成可点链接。 */
export function wikilinksToMarkdown(markdown: string): string {
  return markdown.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => {
    const path = target.trim();
    const withExtension = path.endsWith('.md') || path.startsWith('raw/') ? path : `${path}.md`;
    const label = (alias || path.split('/').pop() || path).replace(/\.md$/, '');
    return `[${label}](${WIKILINK_SCHEME}${encodeURI(withExtension)})`;
  });
}
