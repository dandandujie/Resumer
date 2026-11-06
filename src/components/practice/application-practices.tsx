import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { plainText } from '@/lib/resume-text';
import * as api from '@/lib/tauri-api';
import type { PracticeSession } from '@/types/practice';

export function ApplicationPractices({applicationId,onOpen}:{applicationId:string;onOpen:(session:PracticeSession)=>void}) {
  const [items,setItems]=useState<PracticeSession[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;api.practiceList(undefined,applicationId).then(items=>{if(active){setItems(items);setError('');}}).catch(e=>{if(active)setError(String((e as Error)?.message||e));});return()=>{active=false;};},[applicationId]);
  if(error)return <p className="text-xs text-destructive" role="alert">练习记录读取失败：{error}</p>;
  if(!items.length)return null;
  return <section className="mb-4 space-y-2" aria-label="已保存的经历练习"><h3 className="text-[13px] font-semibold">经历练习与复盘</h3>{items.map(session=><details key={session.id} className="rounded-lg border border-[var(--app-border)] p-3 text-xs leading-6"><summary className="cursor-pointer">{session.target?.label||'综合练习'} · {session.status==='done'?'已结束':'可继续'} · {new Date(session.createdAt*1000).toLocaleDateString()}</summary><div className="mt-2 space-y-2"><p className="break-all text-muted-foreground">依据版本：{session.resumeVersionId}</p>{session.target&&<blockquote>{plainText(session.target.text)}</blockquote>}{session.summary&&<p>{session.summary.summary}</p>}<Button size="sm" variant="outline" onClick={()=>onOpen(session)}>打开练习 / 复盘</Button><details><summary className="cursor-pointer text-muted-foreground">完整问答（原简历删除后仍保留）</summary>{session.rounds.map(round=><article key={round.id} className="mt-2 whitespace-pre-wrap border-t border-[var(--app-border)] pt-2"><p>问：{round.question}</p><p>{round.action==='answer'?'答':round.action==='clarify'?'疑问':'跳过'}：{round.answer}</p><p>{round.evaluation.suggestion}</p></article>)}</details></div></details>)}</section>;
}
