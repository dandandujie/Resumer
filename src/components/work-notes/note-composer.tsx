import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import * as api from '@/lib/work-notes-api';
import { localDay } from '@/lib/work-notes';
import type { WorkNote, WorkExperience } from '@/types/work-notes';

const DRAFT_KEY = 'resumer_work_note_input';
function readDraft(key: string): { id: string; body: string; context: string; occurredOn: string; datePinned?: boolean } {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (v && typeof v.body === 'string' && typeof v.context === 'string' && typeof v.id === 'string' && typeof v.occurredOn === 'string') return { ...v, occurredOn: v.body.trim() || v.datePinned ? v.occurredOn : localDay() }; } catch { /* fresh input */ }
  return { id: crypto.randomUUID(), body: '', context: localStorage.getItem('resumer_work_note_context') || '', occurredOn: localDay() };
}
export function NoteComposer({ contexts, onSaved, onAnalyze, desktop = false, experience, desktopOptions }: { contexts: string[]; onSaved: (note: WorkNote) => void | Promise<void>; onAnalyze: (note: WorkNote) => void; desktop?: boolean; experience?: WorkExperience; desktopOptions?: ReactNode }) {
  const draftKey = experience ? `resumer_note_input:${desktop ? 'desktop:' : ''}${experience.id}` : desktop ? 'resumer_desktop_note_input' : DRAFT_KEY;
  const [draft, setDraft] = useState(() => ({...readDraft(draftKey),...(experience ? {context:`${experience.company} · ${experience.position}`} : {})}));
  const [auto, setAuto] = useState(() => localStorage.getItem('resumer_work_note_auto') !== 'false');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const configured = useSettingsStore(s => Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()));
  useEffect(() => {
    const refresh = () => {
      setAuto(localStorage.getItem('resumer_work_note_auto') !== 'false');
      setDraft(previous => previous.body.trim() || previous.datePinned ? previous : { ...previous, occurredOn: localDay() });
    };
    window.addEventListener('focus', refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const patch = (values: Partial<typeof draft>) => {
    const next = { ...draft, ...values }; setDraft(next); setStatus('');
    try { localStorage.setItem(draftKey, JSON.stringify(next)); setError(''); } catch { setError('输入暂存失败，请先点“记下了”保存这段话。'); }
  };
  const submit = async () => {
    if (lock.current || !draft.body.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await api.saveNote({ ...draft, ...(experience ? {experienceId:experience.id,context:`${experience.company} · ${experience.position}`} : {}) });
      const next = { id: crypto.randomUUID(), body: '', context: draft.context, occurredOn: localDay() };
      setDraft(next);
      try { localStorage.setItem(draftKey, JSON.stringify(next)); localStorage.setItem('resumer_work_note_context', next.context); } catch { /* the submitted note is already in SQLite */ }
      setStatus('原话已保存在本机');
      if (auto && configured) onAnalyze(saved);
      await onSaved(saved);
      if (!desktop) input.current?.focus();
    } catch (e) { setError((e as Error).message || String(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  if (desktop) return <section className="desktop-note-composer" aria-label="随手记一段">
    <label htmlFor="work-note-body" className="sr-only">想留下的话</label>
    <Textarea ref={input} id="work-note-body" value={draft.body} disabled={busy} maxLength={12000} rows={3} placeholder="随便写两句…" onChange={e => patch({ body: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
    <div className="desktop-note-actions">
      <Button variant="ghost" size="icon-xs" aria-label="记录选项" title="记录选项" aria-expanded={optionsOpen} aria-controls="desktop-note-options" onClick={() => setOptionsOpen(v => !v)}><SlidersHorizontal /></Button>
      <span className="desktop-note-context" title={configured && auto ? '记下后由 AI 顺手整理；发送范围可在记录选项中查看' : '仅保存在本机'}>{draft.occurredOn !== localDay() ? draft.occurredOn : configured && auto ? 'AI 顺手整理' : '仅本机'}</span>
      <Button variant="primary" size="icon-sm" className="desktop-note-send" aria-label="记下，收起" disabled={busy || !draft.body.trim()} onClick={() => void submit()} title="记下，收起（⌘/Ctrl + Enter）">{busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}</Button>
    </div>
    {optionsOpen && <div id="desktop-note-options" className="desktop-note-options">
      {experience && <p className="desktop-note-option-context">{experience.company} · {experience.position}</p>}
      <label className="space-y-1"><span>记录日期</span><Input type="date" value={draft.occurredOn} disabled={busy} onChange={e => patch({ occurredOn: e.target.value, datePinned: true })} /></label>
      <div className="desktop-note-ai-option"><Switch id="auto-note-analysis" checked={auto} onCheckedChange={v => { setAuto(v); localStorage.setItem('resumer_work_note_auto', String(v)); }} /><label htmlFor="auto-note-analysis">AI 顺手整理</label></div>
      <p className="desktop-note-option-hint">{configured ? '开启后发送这条和同经历最近 3 条。' : '还没配置 AI，先安心记录。'}</p>
      {desktopOptions}
    </div>}
    {status && <p role="status" className="desktop-note-status">{status}</p>}
    {error && <p role="alert" className="desktop-note-error">{error}</p>}
  </section>;
  return <section className={desktop ? "p-1" : "rounded-lg border bg-[var(--app-surface)] p-4"} aria-label="随手记一段">
    <label htmlFor="work-note-body" className="text-sm font-medium">{desktop ? '忙到现在，有什么想留下的？' : '今天有什么想留下的？'}</label>
    <Textarea ref={input} id="work-note-body" value={draft.body} disabled={busy} maxLength={12000} rows={desktop ? 3 : 4} className="mt-3 min-h-28 resize-y leading-7" placeholder="刚解决一个小问题，开会时冒出一个想法，或者今天真的有点累……想到哪儿说到哪儿。" onChange={e => patch({ body: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">一句也可以。</span>
      <Button variant="primary" size="sm" disabled={busy || !draft.body.trim()} onClick={() => void submit()} title={desktop ? "记下，收起（⌘/Ctrl + Enter）" : "记下了（⌘/Ctrl + Enter）"}>{busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}{desktop ? '记下，收起' : '记下了'}</Button>
    </div>
    <details className="mt-3 text-xs"><summary className="cursor-pointer break-words text-muted-foreground">记录选项{experience ? ` · ${experience.company} · ${experience.position}` : draft.context ? ` · ${draft.context}` : ''}{draft.occurredOn !== localDay() ? ` · ${draft.occurredOn}` : ''} · {configured && auto ? 'AI 顺手整理' : '仅本机记录'}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!experience && <label className="space-y-1"><span>哪段工作 / 实习（可空着）</span><Input list="work-note-contexts" value={draft.context} maxLength={120} disabled={busy} onChange={e => patch({ context: e.target.value })} placeholder="例如：鲸跃科技 · 产品实习" /><datalist id="work-note-contexts">{contexts.map(c => <option key={c} value={c} />)}</datalist></label>}
        <label className="space-y-1"><span>记录日期（也可以补记）</span><Input type="date" value={draft.occurredOn} disabled={busy} onChange={e => patch({ occurredOn: e.target.value, datePinned: true })} /></label>
      </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><Switch id="auto-note-analysis" checked={auto} onCheckedChange={v => { setAuto(v); localStorage.setItem('resumer_work_note_auto', String(v)); }} /><label htmlFor="auto-note-analysis">记下后，AI 顺手整理</label><span>{configured ? '发送这条和同经历最近3条给已配置的 AI，可随时关闭。' : '还没配置 AI，先安心记录。'}</span>{!configured && !desktop && <Button variant="link" size="xs" onClick={() => { useUIStore.getState().setSettingsTab('ai'); useUIStore.getState().openModal('settings'); }}>设置 AI</Button>}</div>
    </details>
    {status && <p role="status" className="mt-2 text-xs text-muted-foreground">{status}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </section>;
}
