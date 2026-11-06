import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { plainText } from '@/lib/resume-text';
import { useRouter } from '@/i18n/routing';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { getResumeWorkspace, updateResumeWorkspace, type ResumeWorkspaceDetail, type ResumeWorkspaceContext } from '@/lib/resume-workspace-api';

const empty: ResumeWorkspaceContext = { goal: '', company: '', role: '', jobDescription: '' };
function sourceText(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [plainText(value)] : [];
  if (Array.isArray(value)) return value.flatMap(sourceText);
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !['id', 'resumeId', 'sectionId', 'visible', 'sortOrder', 'createdAt', 'updatedAt', 'avatar'].includes(key)).flatMap(([,v]) => sourceText(v));
  return [];
}
export function EditorWorkspaceContext({ resumeId, originalDocument = false }: {resumeId: string; originalDocument?: boolean}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ResumeWorkspaceDetail | null>(null), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [open, setOpen] = useState(false), [sourceOpen, setSourceOpen] = useState(false), [busy, setBusy] = useState(false);
  const [context, setContext] = useState<ResumeWorkspaceContext>(empty), [draftNotice, setDraftNotice] = useState('');
  useEffect(() => {
    let active = true;
    void getResumeWorkspace(resumeId).then(value => { if (active) setDetail(value); }).catch(e => { if(active) setError(String(e.message || e)); });
    return () => { active = false; };
  }, [resumeId, revision]);
  const edit = () => {
    const saved = detail?.context || empty;
    try { const cached = JSON.parse(localStorage.getItem(`resumer_target_context:${resumeId}`) || 'null'); setContext(cached?.before === JSON.stringify(saved) ? cached.context : saved); } catch { setContext(saved); }
    setOpen(true); setDraftNotice('');
  };
  const patch = (values: Partial<ResumeWorkspaceContext>) => {
    const next = {...context, ...values}; setContext(next);
    try { localStorage.setItem(`resumer_target_context:${resumeId}`, JSON.stringify({before: JSON.stringify(detail?.context || empty), context: next})); setDraftNotice(''); } catch { setDraftNotice('需求暂存失败，离开前请保存或复制保留。'); }
  };
  const save = async () => {
    if (busy || !context.goal.trim()) return; setBusy(true); setError('');
    try { await updateResumeWorkspace(resumeId, context); localStorage.removeItem(`resumer_target_context:${resumeId}`); setDetail(old => old ? {...old, context} : old); setOpen(false); }
    catch(e) { setError(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const discuss = () => {
    if (!detail?.context) return;
    const configured = useSettingsStore.getState();
    if (!configured.aiApiKey.trim() || !configured.aiBaseURL.trim()) { useUIStore.getState().setSettingsTab('ai'); useUIStore.getState().openModal('settings'); return; }
    useEditorStore.getState().setRightPaneTab('ai');
    useEditorStore.getState().setMobileActiveTab('edit');
    useEditorStore.getState().setPendingAiMessage({resumeId,text:`请围绕这份定向稿已保存的需求，先说明与当前内容的关键差距，再给可审阅的改写提案。目标：${detail.context.goal}\n公司：${detail.context.company}\n岗位：${detail.context.role}\n参考资料：${detail.context.jobDescription}\n保留真实职责和事实，只修改当前定向稿；未知信息先询问，不编造，也不写入占位符。`});
  };
  return <>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-[var(--app-surface)] px-4 py-2 text-[11px]" data-editor-workspace-context>
      {error && !open ? <span role="alert" className="text-destructive">来源信息暂未读取：{error}<Button size="xs" variant="link" onClick={() => {setDetail(null);setError('');setRevision(v=>v+1);}}>重试</Button></span> : !detail ? <span className="text-muted-foreground">正在读取简历归属…</span> : <>
        <div className="w-full min-w-0 sm:w-auto sm:flex-1"><p className="line-clamp-2 break-words font-medium">{detail.context ? `定向稿 · ${detail.context.goal}` : '基础简历 · 长期维护的经历与事实'}</p>{detail.context && <p className="mt-0.5 break-words text-muted-foreground">来源：{detail.sourceTitle}{detail.sourceMissing ? ' · 来源已删除，快照保留' : detail.sourceChanged ? ' · 来源有更新，本稿未自动同步' : ''}</p>}</div>
        <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto"><Button variant="ghost" size="xs" onClick={()=>router.push(`/resume-workspace/${detail.baseMissing ? resumeId : detail.baseResumeId}`)}><ArrowLeft />定向改稿空间</Button>{detail.context && <><Button variant="ghost" size="xs" onClick={edit}><Pencil />目标需求</Button><Button variant="ghost" size="xs" onClick={()=>setSourceOpen(true)}><FileText />创建时来源</Button>{!originalDocument && <Button variant="outline" size="xs" onClick={discuss}><Sparkles />一起改</Button>}</>}</div>
      </>}
    </div>
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>这份定向稿要解决什么需求？</DialogTitle><DialogDescription>需求会留在这份稿中，下次继续改时仍能找回。</DialogDescription></DialogHeader><div className="space-y-3" data-target-context><label className="block space-y-1 text-xs">目标需求<Textarea value={context.goal} maxLength={4000} onChange={e=>patch({goal:e.target.value})} disabled={busy} /></label><details><summary className="cursor-pointer text-xs text-muted-foreground">公司、岗位与参考资料</summary><div className="mt-3 space-y-3"><label className="block space-y-1 text-xs">公司<Input value={context.company} maxLength={200} onChange={e=>patch({company:e.target.value})} disabled={busy}/></label><label className="block space-y-1 text-xs">岗位<Input value={context.role} maxLength={200} onChange={e=>patch({role:e.target.value})} disabled={busy}/></label><label className="block space-y-1 text-xs">职位描述 / 参考资料<Textarea value={context.jobDescription} maxLength={40000} onChange={e=>patch({jobDescription:e.target.value})} disabled={busy}/></label></div></details>{(error||draftNotice)&&<p role="alert" className="text-xs text-destructive">{error||draftNotice}</p>}<Button variant="primary" size="sm" disabled={busy||!context.goal.trim()} onClick={()=>void save()}>{busy&&<Loader2 className="animate-spin"/>}保存目标需求</Button></div></DialogContent></Dialog>
    <Dialog open={sourceOpen} onOpenChange={setSourceOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" data-source-snapshot><DialogHeader><DialogTitle>{detail?.sourceTitle} · 创建时来源</DialogTitle><DialogDescription>这是准备本稿时保留的内容，来源之后的修改不会覆盖它。</DialogDescription></DialogHeader>{detail?.sourceSnapshot?.sections?.map(section=><section key={section.id} className="border-t pt-3"><h3 className="text-sm font-medium">{section.title}</h3><div className="mt-2 space-y-1 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">{sourceText(section.content).map((text,index)=><p key={index}>{text}</p>)}</div></section>)}{Boolean(detail?.sourceSnapshot?.originalDocument)&&<p className="text-xs text-muted-foreground">原文档的来源文件已冻结保留；此处仅展示可读的结构化内容。</p>}</DialogContent></Dialog>
  </>;
}
