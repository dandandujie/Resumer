import { useEffect, useRef, useState } from 'react';
import type { Editor, EditorCommand } from '@docx-editor.dev/core';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** 控件保留编辑器选区，避免数字输入框取得焦点后把格式施加到别处。 */
export function OriginalDocumentSpacing({ engine }: { engine: Editor | null }) {
  const t = useTranslations('originalDocument');
  const pin = useRef<ReturnType<Editor['retainSelection']>>(null);
  const [enabled, setEnabled] = useState(false);
  const [values, setValues] = useState({ before: '', after: '', line: '', letter: '' });
  useEffect(() => {
    if (!engine) return;
    const stop = engine.on('selectionChange', (snapshot) => setEnabled(!!snapshot.selection));
    return () => { stop(); if (pin.current) engine.releaseSelection(pin.current); pin.current = null; };
  }, [engine]);
  const capture = () => { if (engine && !pin.current) pin.current = engine.retainSelection(); };
  const apply = () => {
    if (!engine) return;
    let group: ReturnType<Editor['beginHistoryGroup']> | undefined;
    try {
      const commands: EditorCommand[] = [];
      const spacing: { beforePt?: number; afterPt?: number } = {};
      for (const key of ['before', 'after'] as const) {
        if (!values[key]) continue;
        const value = Number(values[key]);
        if (!Number.isFinite(value) || value < 0 || value > 200) throw new Error(t('invalidSpacing'));
        spacing[key === 'before' ? 'beforePt' : 'afterPt'] = value;
      }
      if (Object.keys(spacing).length) commands.push({ type: 'setParagraphSpacing', ...spacing });
      if (values.line) {
        const line = Number(values.line);
        if (!Number.isFinite(line) || line < 0.5 || line > 5) throw new Error(t('invalidLine'));
        commands.push({ type: 'setLineSpacing', rule: 'multiple', value: line });
      }
      if (values.letter) {
        const value = Number(values.letter);
        if (!Number.isFinite(value) || value < -2 || value > 10) throw new Error(t('invalidSpacing'));
        if (engine.snapshot().selectionCollapsed) throw new Error(t('selectText'));
        commands.push({ type: 'setMarkAttr', mark: 'characterSpacing', attr: 'val', value: Math.round(value * 20) });
      }
      for (const command of commands) { const result = engine.can(command); if (!result.ok) throw new Error(result.reason); }
      group = engine.beginHistoryGroup();
      for (const command of commands) {
        const result = engine.exec(command, { historyGroup: group });
        if (!result.ok) throw new Error(result.reason);
      }
      if (pin.current) { engine.releaseSelection(pin.current); pin.current = null; }
      engine.focus();
      toast.success(t('spacingApplied'), { position: 'bottom-right' });
    } catch (error) { toast.error((error as Error).message); }
    finally { group?.end(); }
  };
  return <div onPointerDownCapture={capture} onFocusCapture={capture} onBlurCapture={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null) && pin.current && engine) {
      engine.releaseSelection(pin.current); pin.current = null;
    }
  }} className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--whale-divider)] bg-white px-5 py-2 text-xs">
    <span className="text-[var(--whale-ink-muted)]">{t('spacing')}</span>
    {(['before', 'after', 'line', 'letter'] as const).map((key) => <label key={key} className="flex items-center gap-2">
      {t(key)}
      <input type="number" aria-label={t(key)} placeholder="—" min={key === 'letter' ? -2 : key === 'line' ? 0.5 : 0} max={key === 'letter' ? 10 : key === 'line' ? 5 : 200} step={key === 'line' ? 0.1 : 0.5} disabled={!engine} value={values[key]}
        onChange={(event) => setValues((old) => ({ ...old, [key]: event.target.value }))}
        className="h-7 w-16 rounded border border-[var(--whale-divider)] px-2" />{key === 'line' ? '×' : 'pt'}
    </label>)}
    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!enabled || !Object.values(values).some(Boolean)} onMouseDown={(event) => event.preventDefault()} onClick={apply}>{t('applySpacing')}</Button>
  </div>;
}
