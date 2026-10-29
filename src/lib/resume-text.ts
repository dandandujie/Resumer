import { CJK_FONTS, LATIN_FONTS, isFontSchemeId, isLatinFontId } from '@/lib/theme-config';

/**
 * 简历文本字段的内联标记（与 src-tauri/src/export/inline.rs 同一算法，见 docs/plans/2026-09-05-optimization/标记语法.md）：
 * `**粗体**` `*斜体*` `__下划线__` `` `代码` `` 是开关式标记；`{{color=#c00}}…{{/color}}`
 * `{{size=12}}…{{/size}}`（pt）`{{font=songti}}…{{/font}}`（中文字体 id）是可嵌套的属性标记；
 * `\` 转义其后的 `\ * _ ` {`。
 *
 * 存储只有这一种格式。所见即所得编辑器、预览/PDF、导出都先解析成 InlineRun[]，
 * 编辑器改完再由 serializeInline 写回——标记从不直接暴露给用户。
 */

export interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
  size?: number;
  font?: string;
  /** 字符间距，单位 pt；负值表示紧缩。 */
  spacing?: number;
  /** 当前字段是一段，换行是软换行；段前/段后 pt 与倍数行距，空项继承主题。 */
  paragraph?: string;
}

export interface InlineRun extends InlineStyle {
  text: string;
}

type ToggleKey = 'bold' | 'italic' | 'underline' | 'code';
type AttrKey = 'color' | 'size' | 'font' | 'spacing' | 'paragraph';

export const MIN_SPAN_SIZE_PT = 6;
export const MAX_SPAN_SIZE_PT = 40;
const TOGGLES: [ToggleKey, string][] = [['bold', '**'], ['italic', '*'], ['underline', '__'], ['code', '`']];
const ATTR_KEYS: AttrKey[] = ['color', 'size', 'font', 'spacing', 'paragraph'];
const STYLE_KEYS: (keyof InlineStyle)[] = ['bold', 'italic', 'underline', 'code', 'color', 'size', 'font', 'spacing', 'paragraph'];
const ESCAPABLE = '\\*_`{';
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
// 与 Rust `str::parse::<f64>` 接受的写法对齐（不接受首尾空白与十六进制）
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function isAttrKey(key: string): key is AttrKey {
  return (ATTR_KEYS as string[]).includes(key);
}

function attrToken(input: string, index: number) {
  if (!input.startsWith('{{', index)) return null;
  const end = input.indexOf('}}', index + 2);
  if (end < 0) return null;
  const body = input.slice(index + 2, end);
  const length = end + 2 - index;
  if (body.startsWith('/')) {
    const key = body.slice(1);
    return isAttrKey(key) ? { closing: true, key, value: '', length } : null;
  }
  const eq = body.indexOf('=');
  if (eq < 0) return null;
  const key = body.slice(0, eq);
  return isAttrKey(key) ? { closing: false, key, value: body.slice(eq + 1), length } : null;
}

function validAttr(key: AttrKey, value: string): string | number | null {
  if (key === 'paragraph') return parseParagraph(value) ? value : null;
  if (key === 'spacing') {
    if (!NUMBER_PATTERN.test(value)) return null;
    const spacing = Number(value);
    return spacing >= -2 && spacing <= 10 ? spacing : null;
  }
  if (key === 'color') return COLOR_PATTERN.test(value) ? value.toLowerCase() : null;
  if (key === 'size') {
    if (!NUMBER_PATTERN.test(value)) return null;
    const pt = Number(value);
    return pt >= MIN_SPAN_SIZE_PT && pt <= MAX_SPAN_SIZE_PT ? pt : null;
  }
  return value.trim() ? value.trim() : null;
}

/** 标记串 → 样式片段。开关标记没有配对、属性值非法或未闭合时，标记按普通文本保留。 */
export function parseInline(input: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const toggles: Record<ToggleKey, boolean> = { bold: false, italic: false, underline: false, code: false };
  const stacks: Record<AttrKey, (string | number)[]> = { color: [], size: [], font: [], spacing: [], paragraph: [] };
  let text = '';
  const flush = () => {
    if (!text) return;
    const run: InlineRun = { text };
    for (const [key] of TOGGLES) if (toggles[key]) run[key] = true;
    if (stacks.color.length) run.color = stacks.color[stacks.color.length - 1] as string;
    if (stacks.size.length) run.size = stacks.size[stacks.size.length - 1] as number;
    if (stacks.font.length) run.font = stacks.font[stacks.font.length - 1] as string;
    if (stacks.spacing.length) run.spacing = stacks.spacing[stacks.spacing.length - 1] as number;
    if (stacks.paragraph.length) run.paragraph = stacks.paragraph[stacks.paragraph.length - 1] as string;
    runs.push(run);
    text = '';
  };

  let index = 0;
  while (index < input.length) {
    const ch = input[index];
    if (ch === '\\' && index + 1 < input.length && ESCAPABLE.includes(input[index + 1])) {
      text += input[index + 1];
      index += 2;
      continue;
    }

    const token = ch === '{' ? attrToken(input, index) : null;
    if (token) {
      const raw = input.slice(index, index + token.length);
      index += token.length;
      const stack = stacks[token.key];
      if (token.closing) {
        // 没有对应开标记的关闭标记按文本保留
        if (!stack.length) text += raw;
        else {
          flush();
          stack.pop();
        }
        continue;
      }
      const value = validAttr(token.key, token.value);
      if (value === null || !input.includes(`{{/${token.key}}}`, index)) {
        text += raw;
        continue;
      }
      flush();
      stack.push(value);
      continue;
    }

    const marker = ch === '`' ? '`'
      : ch === '*' ? (input.startsWith('**', index) ? '**' : '*')
        : ch === '_' && input.startsWith('__', index) ? '__'
          : null;
    if (!marker) {
      text += ch;
      index += 1;
      continue;
    }
    const key = TOGGLES.find(([, value]) => value === marker)![0];
    if (!toggles[key] && !input.includes(marker, index + marker.length)) {
      text += marker;
      index += marker.length;
      continue;
    }
    flush();
    toggles[key] = !toggles[key];
    index += marker.length;
  }
  flush();
  return runs;
}

export function sameStyle(a: InlineStyle, b: InlineStyle): boolean {
  // false / 空串与"未设置"等价（合法的颜色、字号、字体都不会是假值）
  return STYLE_KEYS.every((key) => (a[key] === false ? undefined : a[key]) === (b[key] === false ? undefined : b[key]));
}

export function styleOf(run: InlineStyle): InlineStyle {
  const style: InlineStyle = {};
  for (const key of STYLE_KEYS) {
    const value = run[key];
    if (value !== undefined && value !== false) (style as Record<string, unknown>)[key] = value;
  }
  return style;
}

/** 合并相邻同样式片段、丢掉空片段——序列化与比较都以它为准。 */
export function normalizeRuns(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, run)) last.text += run.text;
    else out.push({ ...styleOf(run), text: run.text });
  }
  return out;
}

function escapeText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    const atEdge = i === 0 || i === text.length - 1;
    const escape =
      ch === '*' || ch === '`'
      || (ch === '_' && (atEdge || next === '_' || text[i - 1] === '_'))
      || (ch === '{' && next === '{')
      || (ch === '\\' && (i === text.length - 1 || ESCAPABLE.includes(next)));
    out += escape ? `\\${ch}` : ch;
  }
  return out;
}

/**
 * 片段边界只写发生变化的标记：先关掉结束的开关标记、再换属性、最后打开新开关标记，
 * 每个开关在一个边界最多翻转一次——保证 parseInline 能原样读回（往返测试见 scripts/test-resume-text.ts）。
 */
function transition(from: InlineStyle, to: InlineStyle): string {
  const flips = (on: boolean) =>
    TOGGLES.filter(([key]) => Boolean(from[key]) !== Boolean(to[key]) && Boolean(to[key]) === on)
      .map(([, marker]) => marker)
      .join('');
  let attrs = '';
  for (const key of ATTR_KEYS) {
    if (from[key] === to[key]) continue;
    if (from[key] !== undefined) attrs += `{{/${key}}}`;
    if (to[key] !== undefined) attrs += `{{${key}=${to[key]}}}`;
  }
  return flips(false) + attrs + flips(true);
}

/** 样式片段 → 标记串（parseInline 的逆运算）。 */
export function serializeInline(runs: InlineRun[]): string {
  let out = '';
  let previous: InlineStyle = {};
  for (const run of normalizeRuns(runs)) {
    out += transition(previous, run) + escapeText(run.text);
    previous = run;
  }
  return out + transition(previous, {});
}

export function plainText(input: string): string {
  return parseInline(input).map((run) => run.text).join('');
}

/* ── 编辑操作：都以纯文本偏移 [start, end) 表达，编辑器与工具条共用 ─────────────────── */

function splitAt(runs: InlineRun[], offset: number): InlineRun[] {
  const out: InlineRun[] = [];
  let position = 0;
  for (const run of runs) {
    const end = position + run.text.length;
    if (offset > position && offset < end) {
      out.push({ ...run, text: run.text.slice(0, offset - position) }, { ...run, text: run.text.slice(offset - position) });
    } else out.push(run);
    position = end;
  }
  return out;
}

/** 按 [start, end) 把片段切成前、中、后三段（切口都落在片段边界上）。 */
function partition(runs: InlineRun[], start: number, end: number) {
  const parts = { before: [] as InlineRun[], inside: [] as InlineRun[], after: [] as InlineRun[] };
  let position = 0;
  for (const run of splitAt(splitAt(runs, start), end)) {
    const bucket = position + run.text.length <= start ? parts.before : position >= end ? parts.after : parts.inside;
    bucket.push(run);
    position += run.text.length;
  }
  return parts;
}

function mapRange(runs: InlineRun[], start: number, end: number, fn: (run: InlineRun) => InlineRun): InlineRun[] {
  const { before, inside, after } = partition(runs, start, end);
  return [...before, ...inside.map(fn), ...after];
}

/** 给区间内文字套用样式；patch 里值为 undefined/false 的键表示去掉该样式。 */
export function applyStyle(runs: InlineRun[], start: number, end: number, patch: InlineStyle): InlineRun[] {
  return normalizeRuns(mapRange(runs, start, end, (run) => ({ ...run, ...patch })));
}

export function clearStyle(runs: InlineRun[], start: number, end: number): InlineRun[] {
  return normalizeRuns(mapRange(runs, start, end, (run) => ({ text: run.text, ...(run.paragraph ? { paragraph: run.paragraph } : {}) })));
}

/** 光标处输入沿用前一个字的样式（和 Word 一致）；行首沿用后一个字。 */
export function styleAt(runs: InlineRun[], offset: number): InlineStyle {
  let position = 0;
  for (const run of runs) {
    const end = position + run.text.length;
    if (offset > position && offset <= end) return styleOf(run);
    position = end;
  }
  return runs[0] && offset === 0 ? styleOf(runs[0]) : {};
}

export function replaceText(runs: InlineRun[], start: number, end: number, text: string, style = styleAt(runs, start)): InlineRun[] {
  const { before, after } = partition(runs, start, end);
  return normalizeRuns([...before, { ...style, text }, ...after]);
}

/** 区间内统一的样式：某项在整段都一致才算"生效"，用于工具条按钮的按下态。 */
export function commonStyle(runs: InlineRun[], start: number, end: number): InlineStyle {
  if (start >= end) return styleAt(runs, start);
  const { inside } = partition(runs, start, end);
  const result: InlineStyle = {};
  for (const key of STYLE_KEYS) {
    const first = inside[0]?.[key];
    if (first !== undefined && first !== false && inside.every((run) => run[key] === first)) (result as Record<string, unknown>)[key] = first;
  }
  return result;
}

/* ── HTML 渲染（预览、PDF 共用）──────────────────────────────────────────────── */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 片段的内联 CSS；编辑器与预览同一份，保证所见即所得。 */
export function runCss(style: InlineStyle): string {
  const parts: string[] = [];
  if (style.color) parts.push(`color:${style.color}`);
  if (style.size) parts.push(`font-size:${style.size}pt`);
  if (style.font && isFontSchemeId(style.font)) parts.push(`font-family:${CJK_FONTS[style.font].screen}`);
  if (style.font && isLatinFontId(style.font)) parts.push(`font-family:${LATIN_FONTS[style.font].screen}`);
  if (style.spacing !== undefined) parts.push(`letter-spacing:${style.spacing}pt`);
  return parts.join(';');
}

function runHtml(run: InlineRun): string {
  let html = escapeHtml(run.text);
  if (run.code) html = `<code>${html}</code>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  const css = runCss(run);
  // data-fmt 让主题 CSS 的 !important 字号规则放过它（见 buildThemeCss）
  return css ? `<span data-fmt style="${css}">${html}</span>` : html;
}

/** 按换行把片段切成行；样式跨行时每行各自闭合，列表化时不会产生错乱嵌套。 */
function splitLines(runs: InlineRun[]): InlineRun[][] {
  const lines: InlineRun[][] = [[]];
  for (const run of runs) {
    run.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  return lines;
}

/** 去掉行首 head 个字符（列表符号），再去掉首尾空白。 */
function trimLine(line: InlineRun[], head: number): InlineRun[] {
  const lineLength = line.reduce((sum, run) => sum + run.text.length, 0);
  const runs = partition(line, head, lineLength).inside.map((run) => ({ ...run }));
  while (runs.length && !runs[0].text.trim()) runs.shift();
  while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
  if (runs.length) {
    runs[0].text = runs[0].text.trimStart();
    runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
  }
  return runs;
}

const LIST_PREFIX = /^[-–•]\s+/;

export function parseParagraph(value?: string): (number | undefined)[] | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 3 || parts.every(part => part === '')) return null;
  const numbers = parts.map(part => part === '' ? undefined : Number(part));
  return parts.every((part, i) => part === '' || (NUMBER_PATTERN.test(part) && Number.isFinite(numbers[i]) && numbers[i]! >= (i === 2 ? 0.5 : 0) && numbers[i]! <= (i === 2 ? 4 : 72))) ? numbers : null;
}

export function paragraphCss(value?: string): string {
  const parts = parseParagraph(value);
  if (!parts) return '';
  return [parts[0] !== undefined && `padding-top:${parts[0]}pt`, parts[1] !== undefined && `padding-bottom:${parts[1]}pt`, parts[2] !== undefined && `line-height:${parts[2]}`].filter(Boolean).join(';');
}

export function md(text: unknown): string {
  const css = paragraphCss(parseInline(String(text ?? ''))[0]?.paragraph);
  const html = inlineMarkdown(text);
  return css ? `<span data-paragraph style="display:block;${css}">${html}</span>` : html;
}

function inlineMarkdown(text: unknown): string {
  if (text == null) return '';
  const lines = splitLines(parseInline(String(text)));
  if (lines.length === 1) return lines[0].map(runHtml).join('');

  let html = '';
  let inList = false;
  let pendingBreak = false;
  for (const line of lines) {
    const plain = line.map((run) => run.text).join('');
    if (!plain.trim()) {
      if (inList) {
        html += '</ul>';
        inList = false;
        pendingBreak = false;
      } else if (html) {
        // 普通段落的空行属于正文，不能拼成同一行。
        html += '<br>';
      }
      continue;
    }
    const list = plain.trim().match(LIST_PREFIX);
    const head = list ? plain.length - plain.trimStart().length + list[0].length : 0;
    const content = trimLine(line, head).map(runHtml).join('');
    if (list) {
      if (!inList) html += '<ul style="margin:2px 0;padding-left:1.5em;list-style-type:disc">';
      inList = true;
      pendingBreak = false;
      html += `<li>${content}</li>`;
      continue;
    }
    if (inList) html += '</ul>';
    inList = false;
    html += (pendingBreak ? '<br>' : '') + content;
    pendingBreak = true;
  }
  if (inList) html += '</ul>';
  return html;
}
