import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import * as api from '@/lib/note-reminder-api';

export function ReminderSettings() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<api.NoteReminderState | null>(null);
  const [draft, setDraft] = useState<api.NoteReminderConfig | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api.getNoteReminder().then(v => { if (active) { setSaved(v); setDraft(v.config); } }).catch(e => { if (active) setError(String(e.message || e)); });
    const stop = listen('note-reminder-changed', () => {
      void api.getNoteReminder().then(v => { if (active) setSaved(v); }).catch(e => { if (active) setError(String(e.message || e)); });
    });
    return () => { active = false; void stop.then(fn => fn()); };
  }, [open]);
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true); setError('');
    try { await api.setNoteReminder(draft); setSaved({ config: draft, lastError: null }); setOpen(false); }
    catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };
  return <Popover open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
    <PopoverTrigger asChild><Button variant="ghost" size="sm" className="shrink-0" aria-label="桌面提醒设置"><Bell />{saved?.config.enabled ? `${saved.config.time} 提醒` : '桌面提醒'}{(error || saved?.lastError) && <span className="text-destructive">· 需查看</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4" data-note-reminder-settings>
      <div><h2 className="text-sm font-medium">留一点时间，随口记几句</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">到点在桌面打开小窗，无需进入主界面。</p></div>
      {draft && <>
        <label className="flex items-center justify-between gap-3 text-xs">定时提醒<Switch checked={draft.enabled} disabled={busy} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></label>
        <fieldset disabled={busy || !draft.enabled} className="space-y-3 disabled:opacity-50">
          <label className="flex items-center justify-between gap-3 text-xs"><span>本地时间</span><Input className="w-32" type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} /></label>
          <div><p className="mb-2 text-xs">哪些天</p><div className="flex flex-wrap gap-1" role="group" aria-label="提醒日">{['一','二','三','四','五','六','日'].map((day, i) => <Button key={day} type="button" size="icon-sm" variant={draft.weekdays.includes(i + 1) ? 'selected' : 'outline'} aria-label={`星期${day}`} aria-pressed={draft.weekdays.includes(i + 1)} onClick={() => setDraft({ ...draft, weekdays: draft.weekdays.includes(i + 1) ? draft.weekdays.filter(n => n !== i + 1) : [...draft.weekdays, i + 1] })}>{day}</Button>)}</div></div>
        </fieldset>
        <p className="text-[11px] leading-5 text-muted-foreground">开启后，关闭主窗口会留在菜单栏 / 托盘运行。退出应用后不提醒；电脑休眠超过提醒时间 15 分钟，本次就跳过。正在使用主界面时不打断。</p>
      </>}
      {(error || saved?.lastError) && <p role="alert" className="text-xs text-destructive">{error || saved?.lastError}</p>}
      <div className="flex justify-between gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setError(''); void api.previewNoteReminder().catch(e => setError(String(e.message || e))); }}>试一下</Button><Button variant="primary" size="sm" disabled={busy || !draft || !draft.time || !draft.weekdays.length} onClick={() => void save()}>{busy && <Loader2 className="animate-spin" />}保存提醒</Button></div>
    </PopoverContent>
  </Popover>;
}
