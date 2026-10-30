import { KnowledgeDraftDialog } from '@/components/knowledge/draft-dialog';
import { useSettingsStore } from '@/stores/settings-store';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AudioLines, FileText, Loader2, Play, Settings, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useSpeechStore } from '@/stores/speech-store';
import { useRecordingStore } from '@/stores/recording-store';
import { useUIStore } from '@/stores/ui-store';
import { useJournalStore, type Application } from '@/stores/journal-store';
import * as api from '@/lib/tauri-api';

function describe(error: unknown) { return (error as { message?: string })?.message || String(error); }
export function RecordingsPanel({ application, initialRoundId }: { application: Application; initialRoundId?: string | null }) {
  const aiConfigured = useSettingsStore(s => Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()));
  const [records, setRecords] = useState<api.InterviewRecording[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'transcribe' | 'delete' | null>(null);
  const [pending, setPending] = useState(false);
  const drafts = useRecordingStore(s => s.drafts), jobs = useRecordingStore(s => s.jobs);
  const config = useSpeechStore(s => s.config);
  const [knowledgeDraft,setKnowledgeDraft]=useState<api.KnowledgeDraft|null>(null);
  const refresh = async () => { const rows = await api.recordingList(application.id); setRecords(rows); return rows; };
  useEffect(() => {
    let active = true;
    api.recordingList(application.id).then(rows => { if (active) setRecords(rows); }).catch(e => { if (active) setError(describe(e)); });
    return () => { active = false; };
  }, [application.id]);
  useEffect(() => {
    const subscribe = listen<{ id: string; done: number; total: number }>('recording-progress', event => useRecordingStore.getState().progress(event.payload.id, event.payload));
    return () => { void subscribe.then(unlisten => unlisten()); };
  }, []);
  const current = records.find(r => r.id === selected);
  const draft = current ? drafts[current.id] : undefined;
  const text = draft?.transcript ?? current?.transcript ?? '';
  const roundId = draft ? draft.roundId : current?.roundId ?? null;
  const busy = pending || !!(current && jobs[current.id]);
  const speechSettings = () => { useUIStore.getState().setSettingsTab('speech'); useUIStore.getState().openModal('settings'); };
  const run = async (fn: () => Promise<void>) => { setPending(true); setError(''); try { await fn(); } catch (e) { setError(describe(e)); } finally { setPending(false); } };
  const save = async () => { if (!current) return; await useRecordingStore.getState().save(current.id); await refresh(); };
  const transcribe = async () => {
    if (!current) return;
    const id = current.id;
    setConfirm(null); useRecordingStore.getState().progress(id, { done: 0, total: 1 }); setError('');
    try {
      await useRecordingStore.getState().save(id);
      await api.recordingTranscribe(id, config); await refresh(); toast.success('转写完成，请先校对人名、数字和专业词');
    } catch (e) { setError(describe(e)); await refresh().catch(() => undefined); }
    finally { useRecordingStore.getState().progress(id, null); }
  };
  return <section className="space-y-3 rounded-xl border bg-muted/30 p-4" data-recordings-panel>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><AudioLines className="size-4" />面试录音与文字稿</h3>
      <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={speechSettings}><Settings />语音服务</Button>
        <Button variant="outline" size="sm" disabled={loading} onClick={async () => {
          setLoading(true); setError('');
          try { await useJournalStore.getState().flushApplication(application.id); const imported = await api.recordingImport(application.id, initialRoundId || (application.interviews.length === 1 ? application.interviews[0].id : null)); await refresh(); if (imported[0]) setSelected(imported[0].id); }
          catch (e) { setError(describe(e)); await refresh().catch(() => undefined); } finally { setLoading(false); }
        }}>{loading ? <Loader2 className="animate-spin" /> : <Upload />}导入录音</Button></div>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">录音 → 可校对文字稿 → 本次面试复盘 → 个人知识库。公司与岗位沿用当前记录；明确轮次时自动关联，其余可稍后选择。</p>
    {!records.length && <p className="rounded-lg border border-dashed p-4 text-xs leading-6 text-muted-foreground">已有面试录音？直接导入即可，暂时不必配置转写服务。也可以先添加面试轮次，用文字记录。</p>}
    {records.length > 0 && <div className="flex flex-wrap gap-2">{records.map(record => <Button key={record.id} variant={record.id === selected ? 'selected' : 'outline'} size="sm" className="max-w-full" onClick={() => setSelected(record.id)}><FileText /><span className="truncate">{record.filename}</span><span className="text-[10px] opacity-70">{jobs[record.id] ? '转写中' : drafts[record.id] ? '待保存' : record.transcript ? '已转写' : '待转写'}</span></Button>)}</div>}
    {current && <div className="space-y-3 border-t pt-3" data-recording-detail>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{(current.size / 1024 / 1024).toFixed(1)} MB · 原件在本机保留</span>
        <Button variant="ghost" size="sm" onClick={() => void run(() => api.recordingOpen(current.id))}><Play />播放原始录音</Button></div>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs">关联轮次</span><Select value={roundId || '__none__'} disabled={busy} onValueChange={v => useRecordingStore.getState().edit(current.id, { applicationId: application.id, transcript: text, roundId: v === '__none__' ? null : v })}><SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">稍后关联</SelectItem>{application.interviews.map((r, i) => <SelectItem value={r.id} key={r.id}>{r.round || `第 ${i + 1} 轮`}</SelectItem>)}</SelectContent></Select></div>
      <label className="block space-y-2 text-xs">转写稿 · 可校对，也可直接粘贴已有文字稿<Textarea aria-label="录音转写稿" rows={9} value={text} disabled={busy} onChange={e => useRecordingStore.getState().edit(current.id, { applicationId: application.id, transcript: e.target.value, roundId })} placeholder="尚未转写。点击「转成文字」，或粘贴你已有的转写稿。" className="bg-card text-sm leading-7" /></label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => setConfirm('transcribe')}>{current && jobs[current.id] ? <Loader2 className="animate-spin" /> : <AudioLines />}{current && jobs[current.id] ? `转写中 ${jobs[current.id].done}/${jobs[current.id].total}` : current.transcript ? '重新转写' : '转成文字'}</Button>
        <Button size="sm" variant="outline" disabled={busy || !draft} onClick={() => void run(async () => { await save(); toast.success('已保存校对稿'); })}>保存校对稿</Button>
        <Button size="sm" variant="primary" disabled={busy || !text.trim()} onClick={()=>{if(!aiConfigured){useUIStore.getState().setSettingsTab('ai');useUIStore.getState().openModal('settings');return;}void run(async()=>{await save();const next=await api.knowledgeDistillPrepare('recording',current.id);setKnowledgeDraft(next);toast.success('提炼建议已保存在知识库「待采纳」中');});}}>{pending?<Loader2 className="animate-spin"/>:null}{aiConfigured?'AI 提炼与复盘':'配置 AI 后提炼'}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm('delete')}>删除录音</Button>
      </div>
      {current.error && <p className="text-xs text-destructive">上次转写失败：{current.error}；原始录音已保留。{current.completedParts > 0 && `已缓存 ${current.completedParts} 个分段，使用相同服务和模型重试时会复用。`}</p>}
    </div>}
    {knowledgeDraft&&<KnowledgeDraftDialog key={knowledgeDraft.id} draft={knowledgeDraft} onClose={()=>setKnowledgeDraft(null)} onApplied={()=>void refresh()} onNext={setKnowledgeDraft}/>}
    {error && <p role="alert" className="text-xs leading-6 text-destructive">{error}</p>}
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm === 'delete' ? '删除这段原始录音？' : '开始录音转写？'}</AlertDialogTitle><AlertDialogDescription>{confirm === 'delete' ? '将删除本机原件与该录音的转写稿。已加入知识库的资料仍保留。' : `将把音频发送到 ${config.baseUrl || '尚未配置的服务'}，使用 ${config.model || '尚未配置的模型'}。服务可能计费。${text ? '重新转写会替换现有文字稿，请先保存需要保留的内容。' : '识别完成后可先校对，再用于复盘。'}`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirm === 'delete' && current) { const id = current.id; setConfirm(null); void run(async () => { await api.recordingDelete(id); useRecordingStore.getState().clear(id); await refresh(); setSelected(null); }); } else { void transcribe(); } }}>{confirm === 'delete' ? '删除' : '开始转写'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
