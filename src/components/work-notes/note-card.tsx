import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import * as api from '@/lib/work-notes-api';
import type { WorkNote } from '@/types/work-notes';

export function NoteCard({ note, selected, selectionVisible, showReply, onSelect, onChange, onAnalyze, pending, analysisError }: {
  note: WorkNote; selected: boolean; selectionVisible: boolean; showReply: boolean;
  onSelect: () => void; onChange: () => void; onAnalyze: (note: WorkNote) => void;
  pending?: boolean; analysisError?: string;
}) {
  const [edit, setEdit] = useState(false), [body, setBody] = useState(note.body), [context, setContext] = useState(note.context), [date, setDate] = useState(note.occurredOn);
  const [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setEdit(false); setDeleting(false); onChange(); }
    catch (e) { setError((e as Error).message || String(e)); }
    finally { setBusy(false); }
  };
  const startEdit = () => { setBody(note.body); setContext(note.context); setDate(note.occurredOn); setEdit(true); };
  const reply = note.analysis && <>
    <p className="whitespace-pre-wrap">{note.analysis.reply}</p>
    {note.analysis.question && <p className="mt-1 text-muted-foreground">{note.analysis.question} <span className="text-[10px]">想起来再记也行。</span></p>}
  </>;
  return <article className="min-w-0 rounded-lg border bg-[var(--app-surface)] p-4" data-work-note={note.id} data-app-reveal>
    <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        {selectionVisible && <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`选入回顾：${note.body.slice(0, 30)}`} />}
        <span className="break-words">{note.context ? `${note.context} · ` : ''}{note.occurredOn}</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="随记操作" title="随记操作" disabled={busy || edit}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={startEdit}>修改原话</DropdownMenuItem>
          {!note.analysis && <DropdownMenuItem disabled={pending} onSelect={() => onAnalyze(note)}>聊聊这段</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>删除随记</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {edit ? <div className="space-y-2">
      <Textarea aria-label="修改原话" value={body} disabled={busy} maxLength={12000} rows={5} onChange={e => setBody(e.target.value)} />
      <div className="grid gap-2 sm:grid-cols-2">{!note.experienceId && <Input aria-label="所属经历" maxLength={120} value={context} onChange={e => setContext(e.target.value)} disabled={busy} />}<Input type="date" aria-label="记录日期" value={date} onChange={e => setDate(e.target.value)} disabled={busy} /></div>
      <Button size="xs" disabled={busy || !body.trim()} onClick={() => void run(() => api.saveNote({ ...note, body, context, occurredOn: date }, note.revision))}>保存原话</Button><Button size="xs" variant="ghost" disabled={busy} onClick={() => setEdit(false)}>取消</Button>
    </div> : <p className="whitespace-pre-wrap break-words text-sm leading-7">{note.body}</p>}
    {note.analysis && !edit && <div className="mt-3 text-xs leading-6">
      {showReply && <div className="border-l-2 pl-3" data-app-reveal>{reply}</div>}
      <details className="mt-2 text-muted-foreground"><summary className="cursor-pointer">{showReply ? '整理线索' : '看看当时的整理'}</summary>
        {!showReply && <div className="mt-2">{reply}</div>}
        {note.analysis.facts.map((f, i) => <div key={i} className="mt-2"><p>{f.text}</p><blockquote className="border-l pl-2 text-[11px]">原话：{f.quote}</blockquote></div>)}
      </details>
    </div>}
    {pending && <p role="status" className="mt-2 text-xs text-muted-foreground">原话已保存，正在整理…</p>}
    {deleting && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span>删除这条原话及引用它的整理提案？</span><Button variant="destructive" size="xs" disabled={busy} onClick={() => void run(() => api.deleteNote(note))}>确认删除</Button><Button variant="ghost" size="xs" onClick={() => setDeleting(false)}>保留</Button></div>}
    {(error || analysisError) && <div role="alert" className="mt-2 text-xs text-destructive">{error || `原话已保存，暂时没能整理：${analysisError}`}{!error && <Button variant="link" size="xs" disabled={pending} onClick={() => onAnalyze(note)}>重试整理</Button>}</div>}
  </article>;
}
