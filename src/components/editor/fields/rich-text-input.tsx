'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyStyle,
  clearStyle,
  commonStyle,
  normalizeRuns,
  parseInline,
  replaceText,
  runCss,
  parseParagraph,
  serializeInline,
  styleAt,
  styleOf,
  type InlineRun,
  type InlineStyle,
} from '@/lib/resume-text';
import { cn } from '@/lib/utils';
import { FormatControls } from './format-controls';
import { FORMAT_UI_ATTR, isFormatUi, useFormatTarget } from './format-target';
import { useActiveFieldReporter } from './field-scope';

interface TextRange {
  start: number;
  end: number;
}

interface Snapshot {
  runs: InlineRun[];
  selection: TextRange;
}

const HISTORY_LIMIT = 100;
/** 同类编辑（连续打字、连续删除、连续调色）在这个间隔内合并成一步撤销 */
const HISTORY_MERGE_MS = 800;
const TOOLBAR_GAP = 8;
const VIEWPORT_MARGIN = 8;
const OFFSCREEN = { top: -9999, left: -9999 };

/* ── DOM ↔ 样式片段 ─────────────────────────────────────────────────────────────
   编辑区的 DOM 永远是「一段一个 span」：span 的 data-s 记录样式，内联 CSS 负责显示。
   浏览器自己做的编辑（删除、输入法组字）之后读回 DOM；一旦结构不再规整就按片段重画。 */

function editorCss(style: InlineStyle): string {
  return [
    runCss(style),
    style.bold && 'font-weight:700',
    style.italic && 'font-style:italic',
    style.underline && 'text-decoration:underline',
    style.code && 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(28,26,23,.06);border-radius:3px',
  ].filter(Boolean).join(';');
}

const styleKey = (style: InlineStyle) => JSON.stringify(styleOf(style));
const textLength = (runs: InlineRun[]) => runs.reduce((sum, run) => sum + run.text.length, 0);
const endsWithNewline = (runs: InlineRun[]) => runs.length > 0 && runs[runs.length - 1].text.endsWith('\n');

function renderRuns(root: HTMLElement, runs: InlineRun[]) {
  const nodes: Node[] = runs.map((run) => {
    const span = document.createElement('span');
    span.dataset.s = styleKey(run);
    span.style.cssText = editorCss(run);
    span.textContent = run.text;
    return span;
  });
  // pre-wrap 下末尾的换行不占行，补一个占位 <br>，光标才能落到新起的空行上
  if (endsWithNewline(runs)) nodes.push(document.createElement('br'));
  const paragraph = parseParagraph(runs[0]?.paragraph);
  root.style.lineHeight = paragraph?.[2] === undefined ? '' : String(paragraph[2]);
  root.style.paddingTop = paragraph?.[0] === undefined ? '' : `${paragraph[0]}pt`;
  root.style.paddingBottom = paragraph?.[1] === undefined ? '' : `${paragraph[1]}pt`;
  root.replaceChildren(...nodes);
}

function isCanonical(root: HTMLElement, runs: InlineRun[]): boolean {
  const tail = endsWithNewline(runs) ? 1 : 0;
  const children = root.childNodes;
  if (children.length !== runs.length + tail) return false;
  if (tail && children[runs.length].nodeName !== 'BR') return false;
  return runs.every((run, index) => {
    const node = children[index];
    return node instanceof HTMLSpanElement
      && node.dataset.s === styleKey(run)
      && node.childNodes.length === 1
      && node.firstChild instanceof Text
      && node.firstChild.data === run.text;
  });
}

function lastLeaf(root: Node): Node | null {
  let node = root.lastChild;
  while (node?.lastChild) node = node.lastChild;
  return node;
}

/** 读回 DOM。末尾的 <br> 只是占位（自己补的或浏览器清空后留下的），不算换行。 */
function readRuns(root: HTMLElement): InlineRun[] {
  const runs: InlineRun[] = [];
  const tail = lastLeaf(root);
  const walk = (node: Node, style: InlineStyle) => {
    for (const child of Array.from(node.childNodes)) {
      if (child instanceof Text) runs.push({ ...style, text: child.data });
      else if (child.nodeName === 'BR') {
        if (child !== tail) runs.push({ ...style, text: '\n' });
      } else if (child instanceof HTMLElement) {
        walk(child, child.dataset.s ? { ...style, ...(JSON.parse(child.dataset.s) as InlineStyle) } : style);
      }
    }
  };
  walk(root, {});
  return normalizeRuns(runs);
}

function nodeLength(node: Node, tail: Node | null): number {
  if (node instanceof Text) return node.data.length;
  if (node.nodeName === 'BR') return node === tail ? 0 : 1;
  let sum = 0;
  node.childNodes.forEach((child) => {
    sum += nodeLength(child, tail);
  });
  return sum;
}

/** DOM 位置 → 纯文本偏移 */
function toOffset(root: HTMLElement, container: Node, offset: number): number {
  const tail = lastLeaf(root);
  let total = 0;
  if (container instanceof Text) total = offset;
  else {
    for (let i = 0; i < Math.min(offset, container.childNodes.length); i += 1) total += nodeLength(container.childNodes[i], tail);
  }
  for (let node: Node | null = container; node && node !== root; node = node.parentNode) {
    for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) total += nodeLength(sibling, tail);
  }
  return total;
}

/** 纯文本偏移 → DOM 位置；落在两段交界处时取前一段末尾，接着输入就沿用前一个字的样式（同 Word）。 */
function toPoint(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let position = 0;
  let last: Text | null = null;
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (offset <= position + text.data.length) return { node: text, offset: offset - position };
    position += text.data.length;
    last = text;
  }
  return last ? { node: last, offset: last.data.length } : { node: root, offset: 0 };
}

function readSelection(root: HTMLElement): TextRange | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const a = toOffset(root, range.startContainer, range.startOffset);
  const b = toOffset(root, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function writeSelection(root: HTMLElement, { start, end }: TextRange) {
  const selection = window.getSelection();
  if (!selection) return;
  const from = toPoint(root, start);
  const to = toPoint(root, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** 粘贴/拖入只收纯文本；单行字段把换行折成空格。 */
function normalizeInsert(text: string, multiline: boolean): string {
  const unified = text.replace(/\r\n?/g, '\n');
  return multiline ? unified : unified.replace(/\s*\n\s*/g, ' ');
}

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** 多行：回车换行；单行：回车触发 onEnter（列表行用它新增下一条） */
  multiline?: boolean;
  onEnter?: () => void;
  placeholder?: string;
  ariaLabel: string;
  /** 字段路径，用于和预览联动（见 ActiveField.field）；不传则不联动 */
  field?: string;
  className?: string;
  collapseOnBlur?: boolean;
  inputMode?: React.HTMLAttributes<HTMLDivElement>['inputMode'];
}

/**
 * 所见即所得的简历文本框：选中文字即可设置中文字体、字号、颜色、粗斜下划线（顶部格式栏或选区旁的浮动工具条），
 * 显示的就是最终效果；存储仍是 resume-text 的内联标记，导出五端同一规格。
 * 输入、粘贴、回车、撤销由这里按样式片段处理；删除与输入法组字交给浏览器，完成后读回 DOM。
 */
export function RichTextInput({
  value,
  onChange,
  multiline = false,
  onEnter,
  placeholder,
  ariaLabel,
  field,
  className,
  collapseOnBlur = false,
  inputMode,
}: RichTextInputProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const runsRef = useRef<InlineRun[]>([]);
  /** DOM 当前表示的标记串；null 表示还没渲染过 */
  const valueRef = useRef<string | null>(null);
  const selectionRef = useRef<TextRange>({ start: 0, end: 0 });
  /** 没选中文字时点了格式按钮：记下光标位置与样式，接下来在这里输入的字套用它 */
  const pendingRef = useRef<{ offset: number; style: InlineStyle } | null>(null);
  const compositionRef = useRef<{ start: number; end: number; length: number } | null>(null);
  const historyRef = useRef({ past: [] as Snapshot[], future: [] as Snapshot[], kind: '', at: 0 });
  const reporter = useActiveFieldReporter(field);
  const live = useRef({ onChange, onEnter, multiline, reporter });
  useLayoutEffect(() => {
    live.current = { onChange, onEnter, multiline, reporter };
  });

  const [focused, setFocused] = useState(false);
  /** 焦点在格式工具上（比如取色器）：字段仍算"正在编辑"，格式照样作用于它 */
  const [held, setHeld] = useState(false);
  const [composing, setComposing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [empty, setEmpty] = useState(!value);
  const [selection, setSelection] = useState<TextRange>({ start: 0, end: 0 });
  const [toolbarPos, setToolbarPos] = useState(OFFSCREEN);
  const target = useFormatTarget((s) => (s.target?.id === id ? s.target : null));

  // 编辑逻辑只读写 ref，一次创建；原生事件监听与格式工具都调用它
  const [api] = useState(() => {
    const currentStyle = (): InlineStyle => {
      const { start, end } = selectionRef.current;
      const pending = pendingRef.current;
      return start === end && pending?.offset === start ? pending.style : commonStyle(runsRef.current, start, end);
    };

    const report = () => {
      const { start, end } = selectionRef.current;
      live.current.reporter?.report(runsRef.current.map((run) => run.text).join(''), start, end);
    };

    const refreshTarget = () => {
      const { start, end } = selectionRef.current;
      useFormatTarget.getState().setTarget({
        id,
        style: currentStyle(),
        hasSelection: start !== end,
        paragraph: live.current.multiline || !!live.current.onEnter,
        apply: (patch) => applyPatch(patch),
        clear: () => applyPatch(null),
        focus: () => {
          const root = rootRef.current;
          if (!root) return;
          // focus 会同步触发 onFocus，浏览器此时可能暂时折叠选区；先保留提交前的范围。
          const range = { ...selectionRef.current };
          root.focus();
          writeSelection(root, range);
          selectionRef.current = range;
          setSelection(range);
          report();
          refreshTarget();
        },
      });
    };

    const publish = (runs: InlineRun[], range: TextRange) => {
      runsRef.current = runs;
      selectionRef.current = range;
      setSelection(range);
      setEmpty(runs.length === 0);
      const serialized = serializeInline(runs);
      if (serialized !== valueRef.current) {
        valueRef.current = serialized;
        live.current.onChange(serialized);
      }
      report();
      refreshTarget();
    };

    const remember = (kind: string) => {
      const history = historyRef.current;
      const now = Date.now();
      if (kind !== history.kind || now - history.at > HISTORY_MERGE_MS) {
        history.past.push({ runs: runsRef.current, selection: selectionRef.current });
        if (history.past.length > HISTORY_LIMIT) history.past.shift();
      }
      history.future = [];
      history.kind = kind;
      history.at = now;
    };

    const show = (runs: InlineRun[], range: TextRange) => {
      const root = rootRef.current;
      if (!root) return;
      renderRuns(root, runs);
      // 焦点在取色器上时不抢回选区，否则系统取色面板会被关掉
      if (document.activeElement === root) writeSelection(root, range);
      publish(runs, range);
    };

    const commit = (runs: InlineRun[], range: TextRange, kind: string) => {
      remember(kind);
      show(runs, range);
    };

    const insert = (text: string, range: TextRange, kind: string) => {
      const runs = runsRef.current;
      const pending = pendingRef.current;
      pendingRef.current = null;
      const style = range.start === range.end
        ? (pending?.offset === range.start ? pending.style : styleAt(runs, range.start))
        : styleAt(runs, range.start + 1); // 替换选区时沿用选区第一个字的样式
      const caret = range.start + text.length;
      commit(replaceText(runs, range.start, range.end, text, style), { start: caret, end: caret }, kind);
    };

    function applyPatch(patch: InlineStyle | null) {
      const { start, end } = selectionRef.current;
      if (patch && 'paragraph' in patch) {
        const runs = runsRef.current;
        if (!runs.length) return;
        commit(applyStyle(runs, 0, textLength(runs), patch), { start, end }, 'paragraph');
        return;
      }
      if (start === end) {
        pendingRef.current = { offset: start, style: patch ? { ...currentStyle(), ...patch } : {} };
        refreshTarget();
        return;
      }
      const runs = runsRef.current;
      const next = patch ? applyStyle(runs, start, end, patch) : clearStyle(runs, start, end);
      commit(next, { start, end }, `style:${patch ? Object.keys(patch).join() : 'clear'}`);
    }

    const toggle = (key: 'bold' | 'italic' | 'underline') => applyPatch({ [key]: currentStyle()[key] ? undefined : true });

    const undo = () => {
      const history = historyRef.current;
      const snapshot = history.past.pop();
      if (!snapshot) return;
      history.future.push({ runs: runsRef.current, selection: selectionRef.current });
      history.kind = '';
      show(snapshot.runs, snapshot.selection);
    };

    const redo = () => {
      const history = historyRef.current;
      const snapshot = history.future.pop();
      if (!snapshot) return;
      history.past.push({ runs: runsRef.current, selection: selectionRef.current });
      history.kind = '';
      show(snapshot.runs, snapshot.selection);
    };

    /** 浏览器自己改完 DOM（删除、组字）后读回；结构不规整就重画并还原光标。 */
    const syncFromDom = () => {
      const root = rootRef.current;
      if (!root) return;
      const range = readSelection(root) ?? selectionRef.current;
      const runs = readRuns(root);
      if (!isCanonical(root, runs)) {
        renderRuns(root, runs);
        writeSelection(root, range);
      }
      publish(runs, range);
    };

    /** 输入法上屏的文字若是在"先点格式再打字"的位置输入的，补上待用样式。 */
    const finishComposition = (info: { start: number; end: number; length: number }) => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || pending.offset !== info.start) return;
      const inserted = textLength(runsRef.current) - (info.length - (info.end - info.start));
      if (inserted <= 0) return;
      const end = info.start + inserted;
      show(applyStyle(clearStyle(runsRef.current, info.start, end), info.start, end, pending.style), selectionRef.current);
    };

    const release = () => {
      useFormatTarget.getState().release(id);
      live.current.reporter?.clear();
      pendingRef.current = null;
    };

    return { report, refreshTarget, remember, insert, toggle, undo, redo, syncFromDom, finishComposition, release };
  });

  // 外部改了值（AI 改写、版本恢复、条目换位）才重画；自己写出去的值原样回来时跳过
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || value === valueRef.current) return;
    valueRef.current = value;
    const runs = parseInline(value);
    runsRef.current = runs;
    renderRuns(root, runs);
    setEmpty(runs.length === 0);
    historyRef.current = { past: [], future: [], kind: '', at: 0 };
    if (document.activeElement === root) {
      const end = textLength(runs);
      selectionRef.current = { start: end, end };
      writeSelection(root, selectionRef.current);
    }
  }, [value]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.isComposing || compositionRef.current) return; // 输入法组字交给浏览器，上屏后再读回
      const type = event.inputType;
      const current = readSelection(root) ?? selectionRef.current;
      if (type === 'insertText' || type === 'insertReplacementText' || type === 'insertFromPaste'
        || type === 'insertFromDrop' || type === 'insertFromYank') {
        event.preventDefault();
        const raw = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
        const targetRange = type === 'insertText' ? null : event.getTargetRanges()[0];
        const range = targetRange
          ? {
            start: toOffset(root, targetRange.startContainer, targetRange.startOffset),
            end: toOffset(root, targetRange.endContainer, targetRange.endOffset),
          }
          : current;
        api.insert(normalizeInsert(raw, live.current.multiline), range, type === 'insertText' ? 'typing' : 'paste');
        return;
      }
      if (type === 'insertParagraph' || type === 'insertLineBreak') {
        event.preventDefault();
        if (live.current.multiline) api.insert('\n', current, 'newline');
        else live.current.onEnter?.();
        return;
      }
      if (type === 'historyUndo' || type === 'historyRedo') {
        event.preventDefault();
        if (type === 'historyUndo') api.undo();
        else api.redo();
        return;
      }
      if (type.startsWith('format')) {
        // 不让浏览器自己套 <b>/<font>：格式只走样式片段
        event.preventDefault();
        if (type === 'formatBold') api.toggle('bold');
        if (type === 'formatItalic') api.toggle('italic');
        if (type === 'formatUnderline') api.toggle('underline');
        return;
      }
      if (type.startsWith('delete')) api.remember('delete');
    };
    const onInput = () => {
      if (!compositionRef.current) api.syncFromDom();
    };
    const onCompositionStart = () => {
      const range = readSelection(root) ?? selectionRef.current;
      compositionRef.current = { ...range, length: textLength(runsRef.current) };
      setComposing(true);
      api.remember('typing');
    };
    const onCompositionEnd = () => {
      const info = compositionRef.current;
      compositionRef.current = null;
      setComposing(false);
      api.syncFromDom();
      if (info) api.finishComposition(info);
    };
    root.addEventListener('beforeinput', onBeforeInput);
    root.addEventListener('input', onInput);
    root.addEventListener('compositionstart', onCompositionStart);
    root.addEventListener('compositionend', onCompositionEnd);
    return () => {
      root.removeEventListener('beforeinput', onBeforeInput);
      root.removeEventListener('input', onInput);
      root.removeEventListener('compositionstart', onCompositionStart);
      root.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [api]);

  // 选区变化：更新格式按钮状态、通知预览高亮
  useEffect(() => {
    if (!focused) return;
    const onSelectionChange = () => {
      const root = rootRef.current;
      if (!root || compositionRef.current) return;
      const range = readSelection(root);
      if (!range) return;
      const previous = selectionRef.current;
      if (range.start === previous.start && range.end === previous.end) return;
      selectionRef.current = range;
      setSelection(range);
      if (pendingRef.current && pendingRef.current.offset !== range.start) pendingRef.current = null;
      api.report();
      api.refreshTarget();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [api, focused]);

  // 拖选过程中不弹工具条，松手再出现（同 Word）
  useEffect(() => {
    if (!dragging) return;
    const onPointerUp = () => setDragging(false);
    document.addEventListener('pointerup', onPointerUp);
    return () => document.removeEventListener('pointerup', onPointerUp);
  }, [dragging]);

  // 焦点暂存在格式工具上时，点到别处或 Tab 走才算真正结束编辑
  useEffect(() => {
    if (!held) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) || isFormatUi(event.target)) return;
      setHeld(false);
      api.release();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target === rootRef.current || isFormatUi(event.target)) return;
      setHeld(false);
      api.release();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [api, held]);

  useEffect(() => () => api.release(), [api]);

  const showToolbar = (focused || held) && !dragging && !composing && selection.start !== selection.end;

  useLayoutEffect(() => {
    // 焦点在取色器上时保持原位；再次出现时在绘制前重新定位
    if (!showToolbar || !focused) return;
    const place = () => {
      const root = rootRef.current;
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
      if (!root || !range || !root.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      const width = toolbarRef.current?.offsetWidth ?? 0;
      const height = toolbarRef.current?.offsetHeight ?? 0;
      const above = rect.top - height - TOOLBAR_GAP;
      setToolbarPos({
        top: Math.max(VIEWPORT_MARGIN, Math.min(above >= VIEWPORT_MARGIN ? above : rect.bottom + TOOLBAR_GAP, window.innerHeight - height - VIEWPORT_MARGIN)),
        left: Math.min(
          Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
          window.innerWidth - width - VIEWPORT_MARGIN,
        ),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [focused, selection, showToolbar]);

  return (
    <>
      <div
        ref={rootRef}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        inputMode={inputMode}
        data-editor-field={field}
        contentEditable
        suppressContentEditableWarning
        data-row-input=""
        data-placeholder={placeholder}
        data-empty={empty && !composing ? '' : undefined}
        onFocus={() => {
          setFocused(true);
          setHeld(false);
          const root = rootRef.current;
          selectionRef.current = (root && readSelection(root)) ?? selectionRef.current;
          setSelection(selectionRef.current);
          api.report();
          api.refreshTarget();
        }}
        onBlur={(event) => {
          setFocused(false);
          if (isFormatUi(event.relatedTarget)) setHeld(true);
          else api.release();
        }}
        onPointerDown={() => setDragging(true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
          const key = event.key.toLowerCase();
          if (key === 'b' || key === 'i' || key === 'u') {
            event.preventDefault();
            api.toggle(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
          } else if (key === 'z' || key === 'y') {
            // 字段内自己的撤销栈；不冒泡到编辑器的整份简历撤销
            event.preventDefault();
            event.stopPropagation();
            if (key === 'z' && !event.shiftKey) api.undo();
            else api.redo();
          }
        }}
        className={cn(
          'relative w-full min-w-0 cursor-text whitespace-pre-wrap break-words rounded-md border border-input bg-[var(--whale-card)] px-3 py-1.5',
          'text-sm leading-6 text-[var(--whale-ink)] shadow-xs outline-none transition-[border-color,box-shadow]',
          'hover:border-[var(--whale-ink)]/25 focus:border-ring focus:ring-[3px] focus:ring-ring/25',
          'data-[empty]:before:pointer-events-none data-[empty]:before:absolute data-[empty]:before:text-[var(--whale-ink-muted)]/70',
          'data-[empty]:before:content-[attr(data-placeholder)]',
          multiline ? 'min-h-[5.25rem]' : 'min-h-9',
          collapseOnBlur && !focused && !held && 'max-h-9 overflow-hidden whitespace-nowrap text-ellipsis',
          className,
        )}
      />
      {showToolbar && createPortal(
        <div
          ref={toolbarRef}
          {...{ [FORMAT_UI_ATTR]: '' }}
          role="toolbar"
          aria-label={ariaLabel}
          onMouseDown={(event) => {
            if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
          }}
          className={cn(
            'fixed z-[60] max-w-[calc(100vw-16px)] rounded-xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-1',
            'shadow-[0_10px_30px_-10px_rgba(28,26,23,0.35)] animate-in fade-in-0 zoom-in-95 duration-100',
          )}
          style={toolbarPos}
        >
          <FormatControls target={target} />
        </div>,
        document.body,
      )}
    </>
  );
}
