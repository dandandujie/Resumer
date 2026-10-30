'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Bold, Check, ChevronDown, Eraser, Italic, Underline } from 'lucide-react';
import { CJK_FONTS, LATIN_FONTS, type FontSchemeId, type LatinFontId } from '@/lib/theme-config';
import { parseParagraph, type InlineStyle } from '@/lib/resume-text';
import { cn } from '@/lib/utils';
import type { FormatTarget } from './format-target';

/** 中文排版常用字号（pt）；zh 文案里带「五号/小四」等名称。 */
const SIZE_OPTIONS_PT = [9, 10, 10.5, 11, 12, 14, 15, 16, 18];
/** 简历里够用的一组颜色：墨色三档 + 常见强调色，深浅都能在白纸上读清。 */
const COLOR_SWATCHES = [
  '#1c1a17', '#4b5563', '#9ca3af', '#c0392b', '#d9480f', '#b7791f',
  '#2f855a', '#0f766e', '#1d4ed8', '#1e3a8a', '#6d28d9', '#be185d',
];
const CUSTOM_COLOR_FALLBACK = '#c0392b';
const FONT_IDS = Object.keys(CJK_FONTS) as FontSchemeId[];
const LATIN_IDS = Object.keys(LATIN_FONTS) as LatinFontId[];
const INLINE_FONTS = { ...CJK_FONTS, ...LATIN_FONTS };

/** 按钮按下不抢焦点：正文的选区保持不动，格式才能落到选中的字上。 */
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

const triggerClass = cn(
  'flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-[var(--app-text-secondary)] transition-colors',
  'hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:pointer-events-none disabled:opacity-40',
);

function Dropdown({
  label,
  title,
  disabled,
  className,
  menuClassName,
  children,
}: {
  label: React.ReactNode;
  title: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [openState, setOpen] = useState(false);
  const open = openState && !disabled;
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });

  // 菜单脱离编辑栏的裁剪容器，并在贴近窗口边缘时翻转、收进可见范围。
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = ref.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const top = trigger.bottom + 4;
      setPosition({
        top: Math.max(8, top + menu.offsetHeight <= window.innerHeight - 8 ? top : trigger.top - menu.offsetHeight - 4),
        left: Math.max(8, Math.min(trigger.left, window.innerWidth - menu.offsetWidth - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={() => setOpen((value) => !value)}
        className={cn(triggerClass, open && 'bg-[var(--app-hover)] text-[var(--app-text)]', className)}
      >
        {label}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          data-format-ui=""
          style={position}
          onMouseDown={(event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}
          role="menu"
          aria-label={title}
          className={cn(
            'fixed z-[110] max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1',
            'shadow-[0_12px_32px_-12px_rgba(28,26,23,0.35)]',
            menuClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>, document.body,
      )}
    </div>
  );
}

function MenuItem({
  active,
  onSelect,
  style,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onMouseDown={keepFocus}
      onClick={onSelect}
      style={style}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between gap-4 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px]',
        'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)]',
        active && 'text-[var(--app-text)]',
      )}
    >
      {children}
      <Check className={cn('h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]', !active && 'invisible')} />
    </button>
  );
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--app-text-secondary)] transition-colors',
        'hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:pointer-events-none disabled:opacity-40',
        pressed && 'bg-[var(--app-hover)] text-[var(--app-text)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]',
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px shrink-0 bg-[var(--app-border)]" aria-hidden />;

function NumericSetting({ label, value, min, max, onApply }: {
  label: string; value: number; min: number; max: number; onApply: (value: number) => void;
}) {
  const t = useTranslations('common');
  return <form className="flex items-end gap-2 p-2" onSubmit={(event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('number') as HTMLInputElement;
    if (input.value && input.checkValidity()) onApply(input.valueAsNumber);
  }}>
    <label className="min-w-0 text-xs">{label}
      <input name="number" aria-label={label} type="number" step="any" min={min} max={max} required defaultValue={value}
        className="mt-1 block h-8 w-24 rounded border border-[var(--app-border)] px-2 text-sm" />
    </label>
    <button type="submit" className="h-8 cursor-pointer rounded bg-[var(--app-accent)] px-3 text-xs text-white">{t('save')}</button>
  </form>;
}

/**
 * Word 式的文字格式控件：中文字体、字号、粗斜下划线、字色、清除格式。
 * 没有目标字段时整组禁用；有目标时作用于它的选区（没选中文字则作用于接下来输入的字）。
 */
export function FormatControls({ target }: { target: FormatTarget | null }) {
  const t = useTranslations('editor.selectionFormat');
  const tFont = useTranslations('themeEditor.cjkFont');
  const tLatin = useTranslations('themeEditor.latinFont');
  const style: InlineStyle = target?.style ?? {};
  const disabled = !target;
  const toggle = (key: 'bold' | 'italic' | 'underline') => target?.apply({ [key]: style[key] ? undefined : true });
  const sizeName = (pt: number) => t(`sizeNames.s${String(pt).replace('.', '_')}`);

  return (
    <div className="flex flex-wrap items-center" role="group" aria-label={t('label')}>
      <Dropdown
        title={t('font')}
        disabled={disabled}
        className="w-[7.5rem] justify-between"
        label={
          <span className="truncate" style={style.font && style.font in INLINE_FONTS ? { fontFamily: INLINE_FONTS[style.font as keyof typeof INLINE_FONTS].screen } : undefined}>
            {style.font && style.font in CJK_FONTS ? tFont(style.font) : style.font && style.font in LATIN_FONTS ? tLatin(style.font) : t('fontDefault')}
          </span>
        }
      >
        {(close) => (
          <>
            <MenuItem active={!style.font} onSelect={() => { target?.apply({ font: undefined }); close(); }}>
              {t('themeDefault')}
            </MenuItem>
            <div className="my-1 h-px bg-[var(--app-border)]" />
            {FONT_IDS.map((id) => (
              <MenuItem
                key={id}
                active={style.font === id}
                style={{ fontFamily: CJK_FONTS[id].screen }}
                onSelect={() => { target?.apply({ font: id }); close(); }}
              >
                {tFont(id)}
              </MenuItem>
            ))}
            <div className="my-1 h-px bg-[var(--app-border)]" />
            {LATIN_IDS.map((id) => <MenuItem key={id} active={style.font === id} style={{ fontFamily: LATIN_FONTS[id].screen }} onSelect={() => { target?.apply({ font: id }); close(); }}>{tLatin(id)}</MenuItem>)}
          </>
        )}
      </Dropdown>
      <Dropdown
        title={t('size')}
        disabled={disabled}
        className="w-[4.25rem] justify-between tabular-nums"
        label={<span className="truncate">{style.size ?? t('sizeDefault')}</span>}
      >
        {(close) => (
          <>
            <MenuItem active={!style.size} onSelect={() => { target?.apply({ size: undefined }); close(); }}>
              {t('themeDefault')}
            </MenuItem>
            <div className="my-1 h-px bg-[var(--app-border)]" />
            {SIZE_OPTIONS_PT.map((pt) => (
              <MenuItem key={pt} active={style.size === pt} onSelect={() => { target?.apply({ size: pt }); close(); }}>
                <span className="flex items-baseline gap-2">
                  <span className="w-8 tabular-nums">{pt}</span>
                  <span className="text-[11px] text-[var(--app-text-muted)]">{sizeName(pt)}</span>
                </span>
              </MenuItem>
            ))}
            <NumericSetting label={t('customSize')} value={style.size ?? 10.5} min={6} max={40} onApply={(size) => { target?.apply({ size }); target?.focus(); close(); }} />
          </>
        )}
      </Dropdown>
      <Dropdown title={t('spacing')} disabled={disabled} label={<span>{t('spacing')}</span>}>
        {(close) => <>
          <MenuItem active={style.spacing === undefined} onSelect={() => { target?.apply({ spacing: undefined }); close(); }}>{t('themeDefault')}</MenuItem>
          <NumericSetting label={t('characterSpacing')} value={style.spacing ?? 0} min={-2} max={10} onApply={(spacing) => { target?.apply({ spacing }); target?.focus(); close(); }} />
        </>}
      </Dropdown>
      {target?.paragraph && <Dropdown title={t('paragraph')} disabled={disabled} label={<span>{t('paragraph')}</span>}>
        {(close) => <>
          <MenuItem active={!style.paragraph} onSelect={() => { target.apply({ paragraph: undefined }); target.focus(); close(); }}>{t('themeDefault')}</MenuItem>
          {(['paragraphBefore', 'paragraphAfter', 'paragraphLine'] as const).map((label, index) => <NumericSetting key={label}
            label={t(label)} value={parseParagraph(style.paragraph)?.[index] ?? (index === 2 ? 1.5 : 0)} min={index === 2 ? 0.5 : 0} max={index === 2 ? 4 : 72}
            onApply={(value) => {
              const parts = parseParagraph(style.paragraph) ?? [undefined, undefined, undefined];
              parts[index] = value;
              target.apply({ paragraph: parts.map(part => part ?? '').join(',') }); target.focus(); close();
            }} />)}
        </>}
      </Dropdown>}
      <Divider />
      <ToolButton label={t('bold')} pressed={!!style.bold} disabled={disabled} onClick={() => toggle('bold')}>
        <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
      </ToolButton>
      <ToolButton label={t('italic')} pressed={!!style.italic} disabled={disabled} onClick={() => toggle('italic')}>
        <Italic className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton label={t('underline')} pressed={!!style.underline} disabled={disabled} onClick={() => toggle('underline')}>
        <Underline className="h-3.5 w-3.5" />
      </ToolButton>
      <Divider />
      <Dropdown
        title={t('color')}
        disabled={disabled}
        className="px-1.5"
        menuClassName="w-[13.5rem] p-2"
        label={
          <span className="flex flex-col items-center leading-none">
            <span className="text-[13px] font-semibold">A</span>
            <span className="mt-0.5 h-[3px] w-3.5 rounded-full" style={{ background: style.color ?? 'var(--app-text)' }} />
          </span>
        }
      >
        {(close) => (
          <>
            <MenuItem active={!style.color} onSelect={() => { target?.apply({ color: undefined }); close(); }}>
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border border-[var(--app-border)] bg-[var(--app-text)]" />
                {t('themeDefault')}
              </span>
            </MenuItem>
            <div className="mt-1.5 grid grid-cols-6 gap-1.5 px-1">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  title={color}
                  aria-pressed={style.color === color}
                  onMouseDown={keepFocus}
                  onClick={() => { target?.apply({ color }); close(); }}
                  className={cn(
                    'h-6 w-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110',
                    style.color === color && 'ring-2 ring-[var(--app-accent)] ring-offset-1',
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-muted)]">
              <input
                type="color"
                value={style.color && style.color.length === 7 ? style.color : CUSTOM_COLOR_FALLBACK}
                onChange={(event) => target?.apply({ color: event.target.value })}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              {t('customColor')}
            </label>
          </>
        )}
      </Dropdown>
      <ToolButton label={t('clear')} disabled={disabled} onClick={() => target?.clear()}>
        <Eraser className="h-3.5 w-3.5" />
      </ToolButton>
    </div>
  );
}
