import { ChoiceSelect } from '@/components/ui/choice-select';
import { PracticeReviewRow } from '@/components/practice/review-board';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenCheck, Loader2, Play, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WorkspaceAssistant } from '@/components/ai/workspace-assistant';
import { assertUnchanged, validateWorkspaceFields } from '@/lib/workspace-actions';
import { useUIStore } from '@/stores/ui-store';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useJournalStore } from '@/stores/journal-store';
import { practiceTargets, practiceRewrite, targetKey } from '@/lib/interview-practice';
import { plainText } from '@/lib/resume-text';
import { generateId } from '@/lib/utils';
import * as api from '@/lib/tauri-api';
import type { PracticeAction, PracticeReview, PracticeSession } from '@/types/practice';

const EMPTY_CONTEXT = {company:'',role:'',round:'',jd:'',focus:''};
const KIND = {knowledge:'补知识',expression:'练表达',fact:'补事实'};
const SELECT_CLASS = 'h-9 w-full min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-field)] px-2 text-xs text-[var(--app-text)]';

export function PracticeDialog() {
  const open = useUIStore(s => s.activeModal === 'interview');
  const resume = useResumeStore(s => s.currentResume);
  const applications = useJournalStore(s => s.applications);
  const configured = useSettingsStore(s => Boolean(s.aiApiKey.trim() && s.aiBaseURL.trim()));
  const activeModel = useSettingsStore(s => s.aiModel);
  const initializedResume = useRef<string | null>(null);
  const [context,setContext] = useState({...EMPTY_CONTEXT});
  const [applicationId,setApplicationId] = useState('');
  const [targetId,setTargetId] = useState('');
  const [sessions,setSessions] = useState<PracticeSession[]>([]);
  const [session,setSession] = useState<PracticeSession | null>(null);
  const [reviews,setReviews] = useState<PracticeReview[]>([]);
  const [tab,setTab] = useState<'practice'|'review'>('practice');
  const [input,setInput] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const [reviewFilter,setReviewFilter] = useState<'open'|'mastered'|'all'>('open');
  const [draftId,setDraftId] = useState<string | null>(null);
  const [draftPreview,setDraftPreview] = useState<api.KnowledgeDraft | null>(null);
  const [rewrite,setRewrite] = useState(false);
  const operation = useRef(false);
  const retry = useRef<{id:string;action:PracticeAction;answer:string} | null>(null);
  const startId = useRef<{id:string;fingerprint:string} | null>(null);
  const answerDrafts = useRef(new Map<string,string>());
  const targets = practiceTargets(resume?.sections || []);
  const availableApplications = applications.filter(a => a.resumeId === resume?.id);
  const refresh = useCallback(async () => {
    if (!resume) return;
    const [next,items] = await Promise.all([api.practiceList(resume.id),api.practiceReviewList(resume.id)]);
    setSessions(next); setReviews(items);
  },[resume?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !resume) return;
    let active = true;
    setLoading(true);setError('');setDraftId(null);setRewrite(false);
    const prefill = useEditorStore.getState().toolPrefill;
    const fresh = initializedResume.current !== resume.id || !!prefill;
    if (fresh) {setSession(null);setInput('');setContext({company:prefill?.company||'',role:prefill?.role||'',round:prefill?.round||'',jd:prefill?.jd||'',focus:prefill?.focus||''});setApplicationId(prefill?.applicationId || '');startId.current=null;}
    initializedResume.current = resume.id;
    const selected = prefill?.practiceTarget;
    if(fresh)setTargetId(selected ? targetKey(selected) : '');
    useEditorStore.getState().setToolPrefill(null);
    Promise.all([api.practiceList(resume.id),api.practiceReviewList(resume.id)]).then(([next,items]) => {
      if (!active) return;
      setSessions(next);setReviews(items);
      const requested = prefill?.practiceSessionId;
      const restored = requested ? next.find(s => s.id === requested) : !fresh ? (session ? next.find(s => s.id === session.id) : undefined) : !selected ? next.find(s => s.status === 'in_progress' && (!prefill?.applicationId || s.applicationId === prefill.applicationId)) : undefined;
      if (restored) {setSession(restored);setInput(answerDrafts.current.get(restored.id) || '');}
    }).catch(e => {if(active)setError(String(e?.message || e));}).finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  },[open,resume?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (work: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;setBusy(true);setError('');
    try {await work();} catch(e) {setError(String((e as Error)?.message || e));}
    finally {operation.current=false;setBusy(false);}
  };
  const persistSession = (next: PracticeSession) => {
    if (useResumeStore.getState().currentResume?.id !== next.resumeId || useUIStore.getState().activeModal !== 'interview') return false;
    setSession(next);setSessions(old => [next,...old.filter(s => s.id !== next.id)]);return true;
  };
  const start = () => void run(async () => {
    if (!resume) return;
    // 开始按钮明确说明会保存；读取后端已保存事实并生成不可变版本快照。
    await useResumeStore.getState().flushPendingSave();
    if (applicationId) await useJournalStore.getState().flushApplication(applicationId);
    const fingerprint = JSON.stringify([resume.id,applicationId,context,targetId]);
    const id = startId.current?.fingerprint === fingerprint ? startId.current.id : generateId();startId.current={id,fingerprint};
    const next = await api.practiceStart({id,resumeId:resume.id,applicationId:applicationId || null,context,target:targets.find(t => targetKey(t) === targetId) || null});
    startId.current=null;if(!persistSession(next))return;setInput('');setDraftId(null);setRewrite(false);
  });
  const submit = (action: PracticeAction) => void run(async () => {
    if (!session) return;
    const answer = action === 'skip' ? '' : input.trim();
    const requestId = retry.current?.action === action && retry.current.answer === answer ? retry.current.id : generateId();
    retry.current = {id:requestId,action,answer};
    const next = await api.practiceStep({id:session.id,expectedRevision:session.revision,requestId,action,answer});
    if(!persistSession(next))return;retry.current=null;setInput('');answerDrafts.current.delete(session.id);
  });
  const summarize = (current: PracticeSession) => run(async () => {
    const next = await api.practiceSummarize(current.id,current.revision);if(persistSession(next))await refresh();
  });
  const finish = () => void run(async () => {
    if (!session) return;
    const next = await api.practiceFinish(session.id,session.revision);if(!persistSession(next))return;
    try {const summarized = await api.practiceSummarize(next.id,next.revision);if(persistSession(summarized))await refresh();}
    catch(e) {setError(`问答已完整保存，复盘生成失败，可重试：${String((e as Error)?.message || e)}`);}
  });
  const selectSession = (next: PracticeSession) => {setSession(next);setInput(answerDrafts.current.get(next.id)||'');setDraftId(null);setRewrite(false);retry.current=null;setTab('practice');};
  const newPractice = (previous?: PracticeSession) => {
    retry.current=null;
    if (previous) {setContext(previous.context);setApplicationId(previous.applicationId || '');const target = targets.find(t => previous.target && targetKey(t) === targetKey(previous.target));setTargetId(target ? targetKey(target) : '');}
    setSession(null);setInput('');setDraftId(null);setRewrite(false);startId.current=null;setTab('practice');
  };
  const applyRewrite = () => {
    if (!session) return;
    try {
      const current = useResumeStore.getState().currentResume;
      if (!current) return;
      const patch = practiceRewrite(current,session);
      useEditorStore.getState().pushSnapshot(useResumeStore.getState().sections);
      useResumeStore.getState().updateSection(patch.sectionId,patch.content);
      setRewrite(false);toast.success('已采纳到当前草稿，请核对后保存；可撤销');
    } catch(e) {setError(String((e as Error)?.message || e));}
  };
  const prepareWiki = () => void run(async () => {if(session){const result=await api.practiceWikiPrepare(session.id);setDraftId(result.id);const draft = (await api.knowledgeDrafts()).find(d => d.id === result.id);if(!draft)throw Error('未能读取提案，请稍后到知识库审阅');setDraftPreview(draft);toast.success('复习提案已保存在本机，稍后也可在知识库审阅');}});
  return <Dialog open={open} onOpenChange={value => {if(!value)useUIStore.getState().closeModal();}}>
    <DialogContent className="flex h-[90vh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:max-w-5xl">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>模拟面试 · 经历练习</DialogTitle><DialogDescription>从一段你熟悉的经历聊起。可以慢慢想、跳过问题，也可以随时停下来。</DialogDescription></DialogHeader>
      <div className="flex shrink-0 flex-wrap items-center gap-2"><Button size="sm" variant={tab==='practice'?'selected':'outline'} onClick={()=>setTab('practice')}>练习与复盘</Button><Button size="sm" variant={tab==='review'?'selected':'outline'} onClick={()=>setTab('review')}><BookOpenCheck className="h-3 w-3"/>待复习 · {reviews.filter(r=>r.status==='open').length}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>newPractice()}>新建练习</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>useUIStore.getState().openModal('interview-free')}>自由对话面试</Button></div>
      {!configured && <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>练习依据可先保存在本机。继续问答需要连接 AI。</span><Button size="sm" variant="link" disabled={busy} onClick={()=>{useUIStore.getState().setSettingsTab('ai');useUIStore.getState().openModal('settings');}}>连接 AI</Button></div>}
      {error && <p role="alert" className="shrink-0 rounded-lg border border-destructive/30 p-2 text-xs text-destructive">{error}</p>}
      {loading ? <p role="status" className="p-6 text-sm text-muted-foreground">正在读取本机练习…</p> : tab==='review' ? <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div className="flex flex-wrap gap-2">{(['open','mastered','all'] as const).map(value=><Button size="sm" key={value} variant={reviewFilter===value?'selected':'outline'} onClick={()=>setReviewFilter(value)}>{({open:'待复习',mastered:'已掌握',all:'全部来源'})[value]}</Button>)}</div>
        {reviews.filter(r=>reviewFilter==='all'||r.status===reviewFilter).map(item=><PracticeReviewRow key={`${item.sessionId}:${item.index}`} item={item} onSaved={refresh} onPractice={()=>{const original=sessions.find(s=>s.id===item.sessionId);if(original)newPractice(original);}}/>)}
        {reviews.filter(r=>reviewFilter==='all'||r.status===reviewFilter).length===0 && <p className="p-6 text-sm text-muted-foreground">这里会收集回答中有依据的知识、表达和事实缺口。完成练习并生成复盘后即可查看。</p>}
      </div> : <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <aside className="max-h-[34%] shrink-0 space-y-3 overflow-y-auto rounded-lg border border-[var(--app-border)] p-3 md:max-h-none md:w-64">
          {sessions.length > 0 && <details><summary className="cursor-pointer text-xs">继续或回看练习 · {sessions.length}</summary>
          <label className="block space-y-1 text-xs"><span>已保存的练习</span><ChoiceSelect className={SELECT_CLASS} disabled={busy} value={session?.id || ''} onChange={e=>{const next=sessions.find(s=>s.id===e.target.value);if(next)selectSession(next);else newPractice();}}><option value="">新建练习</option>{sessions.map(s=><option value={s.id} key={s.id}>{s.status==='in_progress'?'继续':'回看'} · {s.target?.label || s.context.role || '综合面试'} · {new Date(s.createdAt*1000).toLocaleDateString()}</option>)}</ChoiceSelect></label></details>}
          {session ? <><p className="text-xs leading-5 text-muted-foreground">本次依据：{session.resumeSnapshot.title} · {new Date(session.createdAt*1000).toLocaleString()}</p><details><summary className="cursor-pointer text-xs text-muted-foreground">查看保存的版本</summary><p className="break-all text-[10px] text-muted-foreground">{session.resumeVersionId}</p></details>{session.target&&<blockquote className="whitespace-pre-wrap border-l-2 border-[var(--app-border)] pl-2 text-xs leading-5">{plainText(session.target.text)}</blockquote>}<div className="space-y-1 text-xs">{session.points.map(point=><p key={point}>{session.coveredPoints.includes(point)?'✓ 已讲清':'○ 待验证'} · {point}</p>)}</div><p className="text-[11px] leading-5 text-muted-foreground">已讲清由回答依据累计；未验证不等于不会。</p>{session.status==='in_progress'&&<Button size="sm" variant="outline" disabled={busy} onClick={finish}>结束并生成复盘</Button>}{session.status==='done'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>newPractice(session)}>围绕这条再练一次</Button>}</> : <>
            <p className="text-xs leading-6 text-muted-foreground">{targets.find(t => targetKey(t) === targetId)?.label || '围绕整份简历'}{[context.company,context.role,context.round].filter(Boolean).length > 0 && ` · ${[context.company,context.role,context.round].filter(Boolean).join(' · ')}`}</p>
            {context.focus && <p className="whitespace-pre-wrap text-xs leading-6">练习重点 · {context.focus}</p>}
            <details><summary className="cursor-pointer text-xs font-medium">调整练习内容与方向</summary><div className="mt-3 space-y-3">
            <label className="block space-y-1 text-xs"><span>练习内容</span><ChoiceSelect className={SELECT_CLASS} value={targetId} disabled={busy} onChange={e=>setTargetId(e.target.value)}><option value="">围绕整份简历</option>{targets.map(target=><option key={targetKey(target)} value={targetKey(target)}>{target.label} · {plainText(target.text).slice(0,36)}</option>)}</ChoiceSelect></label>
            <label className="block space-y-1 text-xs"><span>关联投递（可选）</span><ChoiceSelect className={SELECT_CLASS} value={applicationId} disabled={busy} onChange={e=>{setApplicationId(e.target.value);const app=availableApplications.find(a=>a.id===e.target.value);if(app)setContext({...context,company:app.company,role:app.role,jd:app.jd});}}><option value="">不关联</option>{availableApplications.map(app=><option key={app.id} value={app.id}>{app.company} · {app.role}</option>)}</ChoiceSelect></label>
            <label className="block space-y-1 text-xs"><span>练习重点（可选）</span><Textarea value={context.focus} disabled={busy} onChange={e=>setContext({...context,focus:e.target.value})} placeholder="例如：重点追问项目取舍" rows={2}/></label>
            <details><summary className="cursor-pointer text-xs">公司、岗位与 JD（可选）</summary><div className="mt-2 space-y-2">{(['company','role','round'] as const).map(key=><label key={key} className="block text-xs">{({company:'公司',role:'岗位',round:'轮次'})[key]}<Input value={context[key]} disabled={busy} onChange={e=>setContext({...context,[key]:e.target.value})}/></label>)}<label className="block text-xs">JD<Textarea value={context.jd} disabled={busy} onChange={e=>setContext({...context,jd:e.target.value})}/></label></div></details>
            </div></details>
          </>}
          {configured && <details><summary className="cursor-pointer text-xs text-muted-foreground">AI 设置</summary><p className="mt-2 break-all text-xs text-muted-foreground">{activeModel}</p><Button size="sm" variant="link" disabled={busy} onClick={()=>{useUIStore.getState().setSettingsTab('ai');useUIStore.getState().openModal('settings');}}>切换模型</Button></details>}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-1" aria-live="polite">
            {!session && <div data-app-reveal className="space-y-2 px-2 py-6"><h3 className="text-lg font-medium">先聊聊你做过的事</h3><p className="text-sm leading-6 text-muted-foreground">不用准备一篇完整答案。先开始，想到哪里说到哪里，我们一次聊一个问题。</p></div>}
            {!session && <WorkspaceAssistant scope="mock" title="描述你想怎么练" placeholder="例如：按前端二面来练，重点追问我的项目架构" context={()=>({...context,applications:availableApplications})} onApply={async(actions,base)=>{if(operation.current)throw Error('练习正在处理中');const {company,role,round,jd,focus}=base as typeof context;assertUnchanged({company,role,round,jd,focus},context);const next={...context};for(const action of actions){validateWorkspaceFields(action);if(action.kind!=='mock')throw Error('不是练习设置');for(const [key,value]of Object.entries(action.fields))if(key in next)next[key as keyof typeof next]=String(value);}setContext(next);}}/>}
            {session?.rounds.map((round,index)=><article data-app-reveal key={round.id} className="space-y-2 rounded-lg border border-[var(--app-border)] p-3 text-xs leading-6"><p className="font-medium">第 {index+1} 轮 · {round.question}</p><p className="whitespace-pre-wrap"><span className="text-muted-foreground">{round.action==='answer'?'我的回答':round.action==='clarify'?'我的疑问':'跳过本题'}：</span>{round.answer}</p><p>{round.evaluation.suggestion}</p>{round.evaluation.evidenceQuotes.length>0&&<details><summary className="cursor-pointer text-muted-foreground">回答依据</summary>{round.evaluation.evidenceQuotes.map((quote,i)=><blockquote key={i} className="border-l-2 pl-2">{quote}</blockquote>)}</details>}</article>)}
            {session?.status==='in_progress'&&<div className="rounded-lg bg-[var(--app-summary)] p-3 text-sm leading-6"><p className="mb-1 text-xs text-muted-foreground">当前问题</p>{session.pendingQuestion}</div>}
            {session?.status==='done'&& !session.summary&&<div className="space-y-2 rounded-lg border p-3"><p className="text-xs">问答已完整保存，尚未生成复盘。</p><Button size="sm" disabled={busy} onClick={()=>void summarize(session)}>生成 / 重试复盘</Button></div>}
            {session?.summary&&<section data-app-reveal className="space-y-3 rounded-lg border border-[var(--app-border)] p-3 text-xs leading-6" aria-label="结构化面试复盘"><h3 className="text-sm font-semibold">本次复盘</h3><p>{session.summary.summary}</p>{session.summary.findings.map((finding,i)=><div key={i} className="rounded border border-[var(--app-border)] p-2"><strong>{KIND[finding.kind]} · {finding.detail}</strong><blockquote className="text-muted-foreground">回答依据：{finding.quote}</blockquote><p>准备动作：{finding.nextAction}</p></div>)}<p className="font-medium">下一步：{session.summary.nextAction}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setTab('review')}>查看待复习清单</Button>{session.summary.rewriteSuggestion&&<Button size="sm" variant="outline" onClick={()=>setRewrite(v=>!v)}>审阅经历改写</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={prepareWiki}>生成 Wiki 复习提案</Button></div>
              {rewrite&&<div className="space-y-2 rounded border border-[var(--app-border)] p-3"><p className="text-muted-foreground">原文：{plainText(session.target?.text || '')}</p><p>建议：{plainText(session.summary.rewriteSuggestion)}</p><p className="text-muted-foreground">请核对职责、技术与数字，采纳后进入当前草稿。</p><Button size="sm" onClick={applyRewrite}>采纳这条改写</Button></div>}
              {draftId&&draftPreview&&<div className="space-y-2 rounded border p-3">{draftPreview.payload.pages?.map(page => <details key={page.path} open><summary className="cursor-pointer font-medium">待写入页面：{page.title}</summary><p className="break-all text-muted-foreground">{page.path}</p><pre className="mt-2 whitespace-pre-wrap break-words rounded bg-[var(--app-field)] p-3 text-xs leading-6">{page.body}</pre></details>)}<p>提案将保存本次经历、回答依据、复习动作和笔记。采纳后写入 Wiki；也可稍后在知识库查看。</p><Button size="sm" disabled={busy} onClick={()=>void run(async()=>{await api.knowledgeApplyDraft(draftId);setDraftId(null);toast.success('复习页已写入 Wiki');})}>采纳到 Wiki</Button></div>}
            </section>}
          </div>
          {!session && <div className="mt-2 shrink-0 border-t border-[var(--app-border)] pt-3"><Button className="w-full" variant="primary" disabled={busy||!resume} onClick={start}>{busy?<Loader2 className="h-3 w-3 animate-spin"/>:<Play className="h-3 w-3"/>}{useResumeStore.getState().isDirty?'保存简历并开始':'开始练习'}</Button><p className="mt-2 text-[11px] text-muted-foreground">开始后保存本次依据，每轮自动留存；不需要先填写公司或 JD。</p></div>}
          {session?.status==='in_progress'&&<form className="mt-2 shrink-0 space-y-2 border-t border-[var(--app-border)] pt-3" onSubmit={e=>{e.preventDefault();submit('answer');}}><Textarea aria-label="练习回答或疑问" rows={3} value={input} maxLength={12000} disabled={busy} onChange={e=>{setInput(e.target.value);answerDrafts.current.set(session.id,e.target.value);}} placeholder="像平时聊天一样说说当时的做法，不用一次讲完整"/><div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" disabled={busy||!input.trim()} type="submit">{busy?<Loader2 className="h-3 w-3 animate-spin"/>:<Send className="h-3 w-3"/>}提交回答</Button><Button size="sm" variant="outline" type="button" disabled={busy||!input.trim()} onClick={()=>submit('clarify')}>解释我的疑问</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={()=>submit('skip')}>跳过这题</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={finish}>结束并复盘</Button></div></form>}
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
