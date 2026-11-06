import { ChoiceSelect } from '@/components/ui/choice-select';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/routing';
import { useEditorStore } from '@/stores/editor-store';
import { useUnsavedStore } from '@/stores/unsaved-store';
import * as api from '@/lib/tauri-api';
import type { PracticeReview } from '@/types/practice';
const KIND = {knowledge:'补知识',expression:'练表达',fact:'补事实'};

export function PracticeReviewRow({item,onSaved,onPractice}:{item:PracticeReview;onSaved:()=>Promise<void>;onPractice:()=>void}) {
  const [note,setNote]=useState(item.note);
  const [saving,setSaving]=useState(false);
  const save=async(status:'open'|'mastered')=>{if(saving)return;setSaving(true);try{await api.practiceReviewUpdate(item.sessionId,item.index,status,note);await onSaved();toast.success('复习记录已保存');}catch(e){toast.error(String((e as Error)?.message||e));}finally{setSaving(false);}};
  return <article className="space-y-2 rounded-lg border border-[var(--app-border)] p-3 text-xs leading-6"><div className="flex flex-wrap gap-2"><strong>{KIND[item.finding.kind]} · {item.finding.detail}</strong><span className="text-muted-foreground">{item.status==='mastered'?'已掌握':'待复习'}</span></div><p>来源：{item.target?.label||'综合面试'} · 版本 {item.resumeVersionId}</p><blockquote>回答依据：{item.finding.quote}</blockquote><p>准备动作：{item.finding.nextAction}</p><label className="block">我的复习笔记<Textarea value={note} disabled={saving} onChange={e=>setNote(e.target.value)} rows={2}/></label><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={()=>void save(item.status)}>保存笔记</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>void save(item.status==='mastered'?'open':'mastered')}>{item.status==='mastered'?'重新复习':'标记已掌握'}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={onPractice}>围绕这条再练</Button></div></article>;
}

export function PracticeReviewBoard() {
  const [items,setItems]=useState<PracticeReview[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [status,setStatus]=useState<'open'|'mastered'|'all'>('open');
  const [kind,setKind]=useState('all');
  const router=useRouter();
  const generation=useRef(0);
  const refresh=useCallback(async()=>{const request=++generation.current;try{const values=await api.practiceReviewList();if(request===generation.current){setItems(values);setError('');}}catch(e){if(request===generation.current)setError(String((e as Error)?.message||e));}finally{if(request===generation.current)setLoading(false);}},[]);
  useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh]);
  const practice=async(item:PracticeReview)=>{
    try {
      const session=(await api.practiceList()).find(s=>s.id===item.sessionId);
      if(!session)throw Error('练习来源不存在');
      if(!await api.getResume(session.resumeId))throw Error('原简历已删除，复习笔记和回答依据仍保留；请先选择一份现有简历再练习');
      useUnsavedStore.getState().ask(()=>{useEditorStore.getState().setToolPrefill({...session.context,applicationId:session.applicationId||undefined,practiceTarget:session.target||undefined});useEditorStore.getState().setPendingModal('interview');router.push(`/editor/${session.resumeId}`);});
    }catch(e){toast.error(String((e as Error)?.message||e));}
  };
  const visible=items.filter(item=>(status==='all'||item.status===status)&&(kind==='all'||item.finding.kind===kind));
  return <section className="min-h-0 flex-1 space-y-4 overflow-y-auto" aria-label="面试复习清单"><header><h1 className="app-page-title">待复习</h1><p className="app-page-description">把面试中的知识、表达和事实缺口变成下一次准备；每项保留回答依据与简历版本。</p></header><div className="flex flex-wrap gap-2">{(['open','mastered','all'] as const).map(value=><Button key={value} size="sm" variant={status===value?'selected':'outline'} aria-pressed={status===value} onClick={()=>setStatus(value)}>{({open:'待复习',mastered:'已掌握',all:'全部'})[value]}</Button>)}<ChoiceSelect className="rounded-md border border-[var(--app-border)] bg-[var(--app-field)] px-2 text-xs" aria-label="复习来源类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部类型</option>{Object.entries(KIND).map(([value,label])=><option key={value} value={value}>{label}</option>)}</ChoiceSelect></div>{loading?<p className="text-xs text-muted-foreground">正在读取本机复习记录…</p>:error?<p role="alert" className="text-xs text-destructive">{error}<Button variant="link" onClick={()=>void refresh()}>重试</Button></p>:visible.length?visible.map(item=><PracticeReviewRow key={`${item.sessionId}:${item.index}`} item={item} onSaved={refresh} onPractice={()=>void practice(item)}/>):<p className="rounded-lg border border-dashed border-[var(--app-border)] p-6 text-sm text-muted-foreground">完成一次经历练习并生成复盘后，有回答依据的待补内容会出现在这里。</p>}</section>;
}
