'use client';

import { useTranslations } from 'next-intl';
import { FormatControls } from './fields/format-controls';
import { FORMAT_UI_ATTR, useFormatTarget } from './fields/format-target';

/**
 * 编辑栏顶部常驻的文字格式栏（像 Word 的「开始」选项卡）：作用于当前获得焦点的正文字段。
 * 点在栏的空白处也不抢焦点，正文里的选区保持不变。
 */
export function TextFormatBar() {
  const t = useTranslations('editor.selectionFormat');
  const target = useFormatTarget((s) => s.target);

  return (
    <div
      {...{ [FORMAT_UI_ATTR]: '' }}
      role="toolbar"
      aria-label={t('barLabel')}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
      className="relative z-20 flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-3 py-1.5"
    >
      <FormatControls key={target?.id ?? 'none'} target={target} />
      {!target && (
        <span className="min-w-0 truncate text-[11px] text-[var(--whale-ink-muted)]" title={t('barHint')}>
          {t('barHintShort')}
        </span>
      )}
    </div>
  );
}
