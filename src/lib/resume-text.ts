import { CJK_FONTS, isFontSchemeId } from '@/lib/theme-config';

/**
 * 简历文本字段的内联标记（与 src-tauri/src/export/inline.rs 同规格，见 docs/plans/.../标记语法.md）：
 * `**粗体**` `*斜体*` `__下划线__` `` `代码` ``，以及选区级属性
 * `{{color=#c00}}…{{/color}}` `{{size=12}}…{{/size}}`（pt）`{{font=songti}}…{{/font}}`（中文字体 id）。
 * 属性标记可嵌套；未闭合的按普通文本处理。
 */

export type SpanKind = 'color' | 'size' | 'font';
export const SPAN_KINDS: SpanKind[] = ['color', 'size', 'font'];
export const MIN_SPAN_SIZE_PT = 6;
export const MAX_SPAN_SIZE_PT = 40;

const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SPAN_OPEN = /\{\{(color|size|font)=([^}]*)\}\}/g;
const SPAN_TOKEN = /\{\{\/?(?:color|size|font)(?:=[^}]*)?\}\}/g;

export function spanOpen(kind: SpanKind, value: string) {
  return `{{${kind}=${value}}}`;
}
export function spanClose(kind: SpanKind) {
  return `{{/${kind}}}`;
}

/** 属性值合法才生成样式；非法值（如乱写的颜色）原样保留在文本里，不静默丢弃。 */
function spanStyle(kind: SpanKind, value: string): string | null {
  if (kind === 'color') return COLOR_PATTERN.test(value) ? `color:${value.toLowerCase()}` : null;
  if (kind === 'size') {
    const pt = Number(value);
    return Number.isFinite(pt) && pt >= MIN_SPAN_SIZE_PT && pt <= MAX_SPAN_SIZE_PT ? `font-size:${pt}pt` : null;
  }
  return isFontSchemeId(value) ? `font-family:${CJK_FONTS[value].screen}` : null;
}

/** 把最内层的属性标记换成 span，循环到没有匹配为止（支持嵌套）。 */
function renderSpans(html: string): string {
  const inner = /\{\{(color|size|font)=([^}]*)\}\}((?:(?!\{\{(?:color|size|font)=)[\s\S])*?)\{\{\/\1\}\}/;
  let out = html;
  for (let pass = 0; pass < 20; pass += 1) {
    const match = inner.exec(out);
    if (!match) break;
    const [whole, kind, value, body] = match;
    const style = spanStyle(kind as SpanKind, value);
    // data-fmt 让主题 CSS 的 !important 字号规则放过它（见 buildThemeCss）
    const replacement = style ? `<span data-fmt style="${style}">${body}</span>` : body;
    out = out.slice(0, match.index) + replacement + out.slice(match.index + whole.length);
  }
  return out;
}

/** 去掉全部属性标记（Markdown 导出、TXT、以及"清除格式"用）。 */
export function stripSpanMarkers(text: string): string {
  return text.replace(SPAN_TOKEN, '');
}

/** 去掉全部标记，只留纯文本。 */
export function stripAllMarkers(text: string): string {
  return stripSpanMarkers(text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*]+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

export function hasSpanMarkers(text: string): boolean {
  SPAN_OPEN.lastIndex = 0;
  return SPAN_OPEN.test(text);
}

export function md(text: unknown): string {
  if (text == null) return '';
  let value = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  value = value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  value = renderSpans(value);
  if (!value.includes('\n')) return value;

  const lines = value.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    const list = line.match(/^[-–•]\s+(.*)/);
    if (list) {
      if (!inList) { html += '<ul style="margin:2px 0;padding-left:1.5em;list-style-type:disc">'; inList = true; }
      html += `<li>${list[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += (html && !html.endsWith('>') ? '<br>' : '') + line;
    }
  }
  if (inList) html += '</ul>';
  return html;
}
