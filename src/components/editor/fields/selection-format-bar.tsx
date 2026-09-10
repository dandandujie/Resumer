'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Bold, Eraser, Italic, Underline } from 'lucide-react';
import { CJK_FONTS, type FontSchemeId } from '@/lib/theme-config';
import { spanClose, spanOpen, stripAllMarkers, type SpanKind } from '@/lib/resume-text';
import { cn } from '@/lib/utils';

type FormatTarget = HTMLTextAreaElement | HTMLInputElement;

interface Range {
  start: number;
  end: number;
}

const SIZE_OPTIONS_PT = [9, 10.5, 12, 14, 16];
const DEFAULT_COLOR = '#c0392b';

/** 把选区用 open/close 包起来，并把光标放回包裹后的文本上。 */
export function wrapSelection(
  input: FormatTarget,
  range: Range,
  open: string,
  close: string,
  onChange: (value: string) => void,
) {
  const { start, end } = range;
  const next = `${input.value.slice(0, start)}${open}${input.value.slice(start, end)}${close}${input.value.slice(end)}`;
  onChange(next);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(start + open.length, end + open.length);
  });
}

function clearSelectionFormat(input: FormatTarget, range: Range, onChange: (value: string) => void) {
  const { start, end } = range;
  const cleaned = stripAllMarkers(input.value.slice(start, end));
  onChange(`${input.value.slice(0, start)}${cleaned}${input.value.slice(end)}`);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(start, start + cleaned.length);
  });
}

/**
 * 选中一段文字时浮出的格式工具条（像 Word 的迷你工具栏）。
 * 结果写成字段内的内联标记（`**` / `{{color=…}}` …），预览、PDF、DOCX 按同一套标记渲染。
 * 挂在字段的 relative 容器里；字段失焦且工具条自身没有焦点时收起。
 */
export function SelectionFormatBar({
  inputRef,
  onChange,
}: {
  inputRef: RefObject<FormatTarget | null>;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('editor.selectionFormat');
  const tFont = useTranslations('themeEditor.cjkFont');
  const [range, setRange] = useState<Range | null>(null);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [barFocused, setBarFocused] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const readSelection = () => {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      setRange(end > start ? { start, end } : null);
    };
    const onFocus = () => setFieldFocused(true);
    const onBlur = () => setFieldFocused(false);
    input.addEventListener('select', readSelection);
    input.addEventListener('keyup', readSelection);
    input.addEventListener('mouseup', readSelection);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);
    return () => {
      input.removeEventListener('select', readSelection);
      input.removeEventListener('keyup', readSelection);
      input.removeEventListener('mouseup', readSelection);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
    };
  }, [inputRef]);

  const apply = useCallback(
    (open: string, close: string) => {
      const input = inputRef.current;
      if (!input || !range) return;
      wrapSelection(input, range, open, close, onChange);
    },
    [inputRef, onChange, range],
  );
  const applySpan = (kind: SpanKind, value: string) => apply(spanOpen(kind, value), spanClose(kind));

  const visible = range !== null && (fieldFocused || barFocused);
  if (!visible) return null;

  // mousedown 阻止默认，点按钮时字段不会失焦、选区不丢
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  const iconButton = 'flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:bg-[var(--whale-cream-deep)]';

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={t('label')}
      onFocusCapture={() => setBarFocused(true)}
      onBlurCapture={(event) => {
        if (!barRef.current?.contains(event.relatedTarget as Node | null)) setBarFocused(false);
      }}
      className={cn(
        'absolute right-0 top-0 z-20 flex -translate-y-full items-center gap-0.5 rounded-lg border',
        'border-[var(--whale-divider)] bg-[var(--whale-card)] px-1 py-0.5 text-[var(--whale-ink)] shadow-md',
      )}
    >
      <button type="button" className={iconButton} onMouseDown={keepFocus} onClick={() => apply('**', '**')} aria-label={t('bold')} title={t('bold')}>
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={iconButton} onMouseDown={keepFocus} onClick={() => apply('*', '*')} aria-label={t('italic')} title={t('italic')}>
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={iconButton} onMouseDown={keepFocus} onClick={() => apply('__', '__')} aria-label={t('underline')} title={t('underline')}>
        <Underline className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-[var(--whale-divider)]" />
      <label className="flex h-6 cursor-pointer items-center gap-1 rounded px-1 text-[11px] hover:bg-[var(--whale-cream-deep)]" title={t('color')}>
        <span className="h-3 w-3 rounded-sm border border-[var(--whale-divider)]" style={{ background: DEFAULT_COLOR }} />
        <input
          type="color"
          defaultValue={DEFAULT_COLOR}
          aria-label={t('color')}
          className="h-0 w-0 opacity-0"
          onChange={(event) => applySpan('color', event.target.value)}
        />
        {t('color')}
      </label>
      <select
        aria-label={t('size')}
        title={t('size')}
        value=""
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => event.target.value && applySpan('size', event.target.value)}
        className="h-6 cursor-pointer rounded bg-transparent px-1 text-[11px] hover:bg-[var(--whale-cream-deep)]"
      >
        <option value="">{t('size')}</option>
        {SIZE_OPTIONS_PT.map((pt) => (
          <option key={pt} value={pt}>{pt}pt</option>
        ))}
      </select>
      <select
        aria-label={t('font')}
        title={t('font')}
        value=""
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => event.target.value && applySpan('font', event.target.value)}
        className="h-6 max-w-28 cursor-pointer rounded bg-transparent px-1 text-[11px] hover:bg-[var(--whale-cream-deep)]"
      >
        <option value="">{t('font')}</option>
        {(Object.keys(CJK_FONTS) as FontSchemeId[]).map((id) => (
          <option key={id} value={id}>{tFont(id)}</option>
        ))}
      </select>
      <span className="mx-0.5 h-4 w-px bg-[var(--whale-divider)]" />
      <button
        type="button"
        className={iconButton}
        onMouseDown={keepFocus}
        onClick={() => inputRef.current && range && clearSelectionFormat(inputRef.current, range, onChange)}
        aria-label={t('clear')}
        title={t('clear')}
      >
        <Eraser className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
