import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import * as api from '@/lib/work-notes-api';
import { noteDraftFingerprint } from '@/lib/work-notes';
import type { WorkNote, WorkNoteDraft } from '@/types/work-notes';
import { NoteCard } from './note-card';

type EditableBullet = { text: string; selected: boolean };
export function NoteRecall({ slot, revision = 0, contexts, initialContext = '', onAnalyze, pending = {}, errors = {}, onApply, targetLabel, experienceId }: {
  experienceId?: string; targetLabel?: string; slot: string; revision?: number; contexts: string[]; initialContext?: string;
  onAnalyze: (note: WorkNote) => void; pending?: Record<string, boolean>; errors?: Record<string, string>;
  onApply?: (routine: string[], events: string[]) => void;
}) {
  const [recallOpen, setRecallOpen] = useState(Boolean(onApply));
  const [reviewOpen, setReviewOpen] = useState(Boolean(onApply));
  const recallId = useId();
  const [query, setQuery] = useState(''), [context, setContext] = useState(initialContext);
  const [notes, setNotes] = useState<WorkNote[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [more, setMore] = useState(false), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const questionKey = `resumer_note_question:${slot}`;
  const [question, setQuestion] = useState(() => { try { return localStorage.getItem(questionKey) || ''; } catch { return ''; } }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<WorkNoteDraft | null>(null), [bullets, setBullets] = useState<EditableBullet[]>([]);
  const [applied, setApplied] = useState(false), [confirmedTarget, setConfirmedTarget] = useState(false);
  const epoch = useRef(0), busyRef = useRef(false), matchedContext = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (initialContext && !matchedContext.current) { matchedContext.current = true; setContext(initialContext); } }, [initialContext]);
  const configured = useSettingsStore(s => Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()));
  const restore = (value: WorkNoteDraft | null) => {
    setDraft(value); setApplied(false); setConfirmedTarget(false);
    let edits: EditableBullet[] | undefined;
    try { const saved = JSON.parse(localStorage.getItem(`resumer_note_review:${slot}`) || 'null'); if (saved?.fingerprint === noteDraftFingerprint(value) && Array.isArray(saved.bullets) && saved.bullets.length === value?.bullets.length) edits = saved.bullets; } catch { /* use server draft */ }
    setBullets(edits || value?.bullets.map(b => ({ text: b.text, selected: true })) || []);
  };
  useEffect(() => {
    let active = true;
    void api.loadNoteDraft(slot).then(v => { if (active) restore(v); }).catch(e => { if (active) setError(String(e.message || e)); });
    return () => { active = false; };
    // slot identifies one durable review; editing controls are restored only on opening it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);
  useEffect(() => {
    const request = ++epoch.current; setLoading(true);
    const timer = setTimeout(() => { void api.listNotes(query, context || null,0,experienceId || null).then(next => {
      if (request !== epoch.current) return;
      setNotes(next); setMore(next.length === 100); setSelected(old => old.filter(id => next.some(n => n.id === id)));
    }).catch(e => { if (request === epoch.current) setError(String(e.message || e)); }).finally(() => { if (request === epoch.current) setLoading(false); }); }, 180);
    return () => { clearTimeout(timer); epoch.current++; };
  }, [query, context, revision, refresh,experienceId]);
  const loadMore = async () => {
    const request = epoch.current; setLoading(true);
    try { const next = await api.listNotes(query, context || null, notes.length,experienceId || null); if (request === epoch.current) { setNotes(old => [...old, ...next]); setMore(next.length === 100); } }
    catch (e) { if (request === epoch.current) setError(String((e as Error).message || e)); }
    finally { if (request === epoch.current) setLoading(false); }
  };
  const settings = () => { useUIStore.getState().setSettingsTab('ai'); useUIStore.getState().openModal('settings'); };
  const rememberQuestion = (value: string) => {
    setQuestion(value);
    try { localStorage.setItem(questionKey, value); }
    catch { setError('这句话暂时没能留在本机，离开前请先复制。'); }
  };
  const compose = async (prompt = question) => {
    if (busyRef.current || loading || !notes.length || !prompt.trim()) return;
    if (!configured) { settings(); return; }
    const submittedQuestion = question;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const value = await api.composeNotes(selected, prompt, slot, context || null, query || null,experienceId || null);
      if (!mounted.current) return;
      restore(value); setReviewOpen(true);
      setQuestion(current => current === submittedQuestion ? '' : current);
      try {
        if (localStorage.getItem(questionKey) === submittedQuestion) localStorage.removeItem(questionKey);
      } catch { setError('回复已保存，但未能清理本机的问题草稿。'); }
    } catch (e) { if (mounted.current) setError((e as Error).message || String(e)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const editBullet = (index: number, values: Partial<EditableBullet>) => {
    const next = bullets.map((b, i) => i === index ? { ...b, ...values } : b); setBullets(next);
    try { localStorage.setItem(`resumer_note_review:${slot}`, JSON.stringify({ fingerprint: noteDraftFingerprint(draft), sourceIds: draft?.sources.map(n => n.id), bullets: next })); } catch { setError('审阅中的修改未能暂存，请在关闭前采纳或复制。'); }
  };
  const apply = async () => {
    if (!draft || !onApply || busyRef.current || (targetLabel && !confirmedTarget)) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await api.validateNoteSources(draft.sources);
      const ofKind = (kind: 'routine' | 'event') => bullets.filter((b, i) => b.selected && draft.bullets[i].kind === kind).map(b => b.text);
      onApply(ofKind('routine'), ofKind('event')); setApplied(true);
    } catch (e) { setError((e as Error).message || String(e)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <section className="min-w-0 space-y-4" aria-label="找回工作片段">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{onApply ? '挑选这段经历的片段' : '留下的片段'}</h2>
      {!onApply && <Button variant="ghost" size="sm" aria-expanded={recallOpen} aria-controls={recallId} onClick={() => setRecallOpen(v => !v)}><Search />{recallOpen ? '收起回顾' : '找回片段'}{!recallOpen && question.trim() ? ' · 有未发送内容' : ''}</Button>}
    </div>
    {!recallOpen && (query || context || selected.length > 0) && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="min-w-0 break-words">筛选中{context ? ` · ${context}` : ''}{query ? ` · ${query}` : ''}{selected.length ? ` · 已选${selected.length}条` : ''}</span><Button variant="ghost" size="xs" onClick={() => { setQuery(''); setContext(''); setSelected([]); }}>清除筛选与选择</Button></div>}
    <div id={recallId} hidden={!recallOpen} className="space-y-3" data-note-recall-controls>

    <div className="rounded-lg border bg-[var(--app-surface)] p-3">
      <Textarea aria-label="想回顾什么" value={question} maxLength={2000} onChange={e => rememberQuestion(e.target.value)} disabled={busy} rows={2} placeholder="比如：那次上线出了什么问题，我后来是怎么处理的？" onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void compose(); } }} />
      <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="primary" size="sm" disabled={busy || loading || !notes.length || !question.trim()} onClick={() => void compose()}>{busy ? <Loader2 className="animate-spin" /> : null}{configured ? '一起回想' : '设置 AI'}</Button><Button size="sm" disabled={busy || loading || !notes.length} onClick={() => { const prompt = '帮我回顾这些工作片段，分别整理日常职责和有事实依据的特别事件，作为下一份简历的备选素材。'; void compose(question.trim() ? `${question}\n${prompt}` : prompt); }}>整理成简历素材</Button>{!!selected.length && <Button size="xs" variant="ghost" onClick={() => setSelected([])}>清除选择</Button>}<span className="text-[10px] text-muted-foreground">{experienceId ? '会从这段经历中找原话，回答附有来源。' : '会从当前范围中找原话，回答附有来源。'}</span></div>
    </div>
    <details data-note-filters className="text-xs text-muted-foreground"><summary className="cursor-pointer">按原话筛选{query ? ` · ${query}` : ''}{context ? ` · ${context}` : ''}</summary><div className="mt-3 space-y-2">
    <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label="搜索随记原话" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索原话，例如：报表、上线、客户" className="pl-9" /></div>{!experienceId && <Select value={context || '__all__'} onValueChange={v => setContext(v === '__all__' ? '' : v)}><SelectTrigger className="w-full sm:w-56" aria-label="筛选工作经历"><SelectValue placeholder="全部工作 / 实习" /></SelectTrigger><SelectContent><SelectItem value="__all__">全部工作 / 实习</SelectItem>{[...new Set([...contexts, initialContext].filter(Boolean))].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>}</div>
    </div></details>
      <p className="text-[11px] text-muted-foreground">{selected.length ? `已选 ${selected.length} 条` : '直接说想找什么就好。也可以勾选片段，限定这次回顾的范围。'}</p>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {draft && <details open={reviewOpen} onToggle={e => setReviewOpen(e.currentTarget.open)} className="rounded-lg border bg-[var(--app-surface)] p-4" data-note-draft data-app-reveal>
      <summary className="cursor-pointer text-sm font-medium">{reviewOpen ? '一起回想' : '上次的整理'} · {draft.sources.length} 条原话{draft.stale ? ' · 来源已变化' : ''}</summary>
      <div className="mt-3 space-y-3" data-note-draft-body>
      <p className="text-[11px] text-muted-foreground">来源经历：{[...new Set(draft.sources.map(n => n.context || '未归类'))].join('、')}</p>
      <p className="text-[11px] text-muted-foreground">{draft.question}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{draft.reply}</p>
      <details className="text-[11px] leading-6 text-muted-foreground"><summary className="cursor-pointer">查看本次回顾的原话 · {draft.sources.length} 条</summary><div className="mt-2 max-h-72 space-y-3 overflow-y-auto">{draft.sources.map(note => <blockquote key={note.id} className="border-l-2 pl-3"><p>{note.context || '未归类'} · {note.occurredOn}</p><p className="whitespace-pre-wrap break-words">{note.body}</p></blockquote>)}</div></details>
      {draft.stale && <p role="alert" className="text-xs text-destructive">来源已修改，请重新整理。旧提案不能直接采纳。</p>}
      {!!draft.bullets.length && <details open={Boolean(onApply) || undefined} data-note-materials className="text-xs"><summary className="cursor-pointer font-medium">可用的简历素材 · {draft.bullets.length} 条</summary><div className="mt-3 space-y-3">
      {draft.bullets.map((b, i) => <div key={i} className="space-y-2 border-t pt-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={bullets[i]?.selected ?? false} onChange={e => editBullet(i, { selected: e.target.checked })} disabled={applied} />{b.kind === 'routine' ? '日常职责 · 补入经历描述' : '特别事件 · 补入亮点'}</label><Textarea aria-label={`素材 ${i + 1}`} value={bullets[i]?.text || ''} onChange={e => editBullet(i, { text: e.target.value })} disabled={applied} rows={3} /><details className="text-[11px] leading-6 text-muted-foreground"><summary className="cursor-pointer">对照原话 · {b.sources.length} 处引用</summary>{b.sources.map((source, j) => { const note = draft.sources.find(n => n.id === source.id); return <blockquote key={j} className="mt-2 border-l-2 pl-3"><p>{note?.context || '未归类'} · {note?.occurredOn}</p><p className="whitespace-pre-wrap">{source.quote}</p><details><summary className="cursor-pointer">完整原话</summary><p className="whitespace-pre-wrap break-words">{note?.body}</p></details></blockquote>; })}</details></div>)}
      <p className="text-[11px] text-muted-foreground">引用能帮你回忆依据；措辞、个人贡献和数字仍请核对。可以改字，也可以只留在这里。</p>
      {onApply && targetLabel && <label className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs leading-6"><input type="checkbox" className="mt-1.5" checked={confirmedTarget} onChange={e => setConfirmedTarget(e.target.checked)} disabled={applied} />我已核对：选中的片段确实属于「{targetLabel}」这段经历。</label>}
      {onApply ? <Button variant="primary" size="sm" disabled={busy || applied || draft.stale || (!!targetLabel && !confirmedTarget) || !bullets.some(b => b.selected && b.text.trim())} onClick={() => void apply()}>{applied ? '已补入草稿，可在编辑器撤销' : '将选中素材补入这段经历'}</Button> : <p className="text-xs text-muted-foreground">要用到简历里，打开工作经历的“从随记补充”，在那里审阅并采纳。</p>}
      </div></details>}
      </div>
    </details>}
    {loading && <p role="status" className="text-xs text-muted-foreground">正在找回片段…</p>}
    {!loading && !notes.length && <div className="app-empty"><p className="text-sm">{query || context ? '这次没有找到，换个词或清除筛选试试。' : '还没有片段。写下今天的一件小事，就从这里开始。'}</p></div>}
    <div className="space-y-3">{notes.map((note, index) => <NoteCard selectionVisible={recallOpen} showReply={!onApply && index === 0} key={`${note.id}:${note.revision}`} note={note} selected={selected.includes(note.id)} onSelect={() => { if (selected.includes(note.id)) setSelected(selected.filter(id => id !== note.id)); else if (selected.length < 40) setSelected([...selected, note.id]); else setError('一次先回顾40条，整理完可以再选。'); }} onChange={() => { setRefresh(n => n + 1); void api.loadNoteDraft(slot).then(restore).catch(e => setError(String(e.message || e))); }} onAnalyze={onAnalyze} pending={pending[note.id]} analysisError={errors[note.id]} />)}</div>
    {more && <Button variant="outline" className="w-full" disabled={loading} onClick={() => void loadMore()}>更早的片段</Button>}
  </section>;
}
