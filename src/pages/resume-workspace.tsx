import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useParams } from 'react-router-dom';
import { useLocale } from 'next-intl';
import { ArrowLeft, ArrowUpRight, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from '@/i18n/routing';
import { listResumes } from '@/lib/tauri-api';
import { deriveResumeWorkspace, getResumeWorkspace, listResumeWorkspaces, type ResumeWorkspaceMetadata } from '@/lib/resume-workspace-api';
import type { Resume } from '@/types/resume';
import { defaultResumeWorkspaceTitle } from '@/lib/resume-workspace-title';
import { loadResumeWorkspaceDraft, saveResumeWorkspaceDraft, clearResumeWorkspaceDraft, emptyResumeWorkspaceDraft, type ResumeWorkspaceDraft } from '@/lib/resume-workspace-draft';

export default function ResumeWorkspacePage() {
  const { id = '' } = useParams();
  return <ResumeWorkspaceContent key={id} id={id} />;
}

function ResumeWorkspaceContent({ id }: { id: string }) {
  const zh = useLocale() === 'zh';
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [metadata, setMetadata] = useState<ResumeWorkspaceMetadata[]>([]);
  const [current, setCurrent] = useState<ResumeWorkspaceMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [initialDraft] = useState(() => {
    try { return { value: loadResumeWorkspaceDraft(localStorage, id), error: '' }; }
    catch (e) { return { value: emptyResumeWorkspaceDraft(), error: String(e) }; }
  });
  const [draft, setDraft] = useState(initialDraft.value);
  const [draftError, setDraftError] = useState(initialDraft.error);
  const { goal, title, company, role, jobDescription } = draft;
  const persistDraft = (next: ResumeWorkspaceDraft) => {
    try { saveResumeWorkspaceDraft(localStorage, id, next); setDraftError(''); return true; }
    catch (e) { setDraftError(String(e)); return false; }
  };
  const changeDraft = (field: 'goal' | 'title' | 'company' | 'role' | 'jobDescription', value: string) => {
    const next = { ...draft, [field]: value, request: request.current };
    setDraft(next); persistDraft(next);
  };
  // A failed/ambiguous response must retry the same operation rather than create another copy.
  const request = useRef<{ id: string; fingerprint: string } | null>(initialDraft.value.request);
  useEffect(() => {
    let active = true;
    Promise.all([listResumes(), listResumeWorkspaces(), getResumeWorkspace(id)]).then(([items, contexts, detail]) => {
      if (!active) return; setResumes(items as Resume[]); setMetadata(contexts); setCurrent(detail);
    }).catch(e => { if (active) setLoadError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, retry]);
  const baseId = current?.baseResumeId || id;
  const base = resumes.find(item => item.id === baseId);
  const targets = metadata.filter(item => item.sourceResumeId && item.baseResumeId === baseId);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!goal.trim() || creating || !base) return;
    const values = { sourceResumeId: base.id, title: title.trim() || defaultResumeWorkspaceTitle(base.title, goal), goal: goal.trim(), company: company.trim(), role: role.trim(), jobDescription: jobDescription.trim() };
    const fingerprint = JSON.stringify(values);
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { id: crypto.randomUUID(), fingerprint };
    // Persist the operation identity before invoking, so reload after an ambiguous response stays idempotent.
    if (!persistDraft({ ...draft, request: request.current })) return;
    setCreating(true); setError('');
    try {
      const targetId = await deriveResumeWorkspace({ ...values, requestId: request.current.id });
      try { clearResumeWorkspaceDraft(localStorage, id); }
      catch (e) { toast.error(zh ? `版本已保存，但本机草稿未能清理：${String(e)}` : `Version saved, but the local draft could not be cleared: ${String(e)}`); }
      router.push(`/editor/${targetId}`);
    } catch (e) { setError(String(e)); } finally { setCreating(false); }
  };
  return <div className="app-page" data-workspace="resume-workspace">
    <div><Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}><ArrowLeft />{zh ? '我的简历' : 'My resumes'}</Button></div>
    <header className="app-page-header"><div><p className="app-eyebrow">RESUME WORKSPACE</p><h1 className="app-page-title">{zh ? '定向改稿' : 'Tailor your resume'}</h1><p className="app-page-description">{zh ? '从同一份基础经历出发，为不同岗位或场景准备版本。' : 'Prepare versions for different roles and situations from one base.'}</p></div></header>
    {loading ? <Skeleton className="h-40 rounded-lg" /> : loadError ? <div className="app-panel space-y-3" role="alert"><p className="text-sm">{loadError}</p><Button variant="outline" size="sm" onClick={() => { setLoading(true); setLoadError(''); setRetry(v => v + 1); }}>{zh ? '重新加载' : 'Retry'}</Button></div> : <>
      <section className="app-panel"><div className="app-section-heading"><div><h2 className="app-panel-title">{base?.title || current?.baseTitle}</h2><p className="app-panel-description">{base ? zh ? '基础简历 · 持续积累完整经历' : 'Base resume · your full experience' : zh ? '基础简历已删除，已有定向稿与来源快照仍保留。' : 'Base deleted. Existing versions and their source snapshots are retained.'}</p></div>{base && <Button variant="outline" size="sm" onClick={() => router.push(`/editor/${base.id}`)}>{zh ? '编辑基础简历' : 'Edit base'}<ArrowUpRight /></Button>}</div></section>
      {base && <section className="app-panel"><h2 className="app-panel-title">{zh ? '准备一个版本' : 'Prepare a version'}</h2><p className="app-panel-description">{zh ? '先保存独立副本，再手动编辑或邀请 AI 一起改。' : 'Save an independent copy, then edit it or ask AI for suggestions.'}</p><form className="mt-4 space-y-4" onSubmit={event => void create(event)}>
        <label className="block space-y-2 text-xs font-medium"><span>{zh ? '这次想怎么改？' : 'What would you like to change?'}</span><Textarea required disabled={creating} maxLength={4000} value={goal} onChange={e => changeDraft('goal', e.target.value)} placeholder={zh ? '例如：投递数据分析实习，突出课程项目；或准备一份英文交流版' : 'For example: highlight projects for an internship, or prepare an English version'} /></label>
        <details><summary className="cursor-pointer text-xs text-muted-foreground">{zh ? '名称、岗位与参考资料（选填）' : 'Name, role and reference material (optional)'}</summary><div className="mt-3 space-y-3"><label className="block space-y-1 text-xs"><span>{zh ? '版本名称' : 'Version name'}</span><Input disabled={creating} maxLength={200} value={title} onChange={e => changeDraft('title', e.target.value)} placeholder={zh ? '根据需求自动命名' : 'Named from your goal'} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-xs"><span>{zh ? '公司' : 'Company'}</span><Input disabled={creating} maxLength={200} value={company} onChange={e => changeDraft('company', e.target.value)} /></label><label className="block space-y-1 text-xs"><span>{zh ? '岗位' : 'Role'}</span><Input disabled={creating} maxLength={200} value={role} onChange={e => changeDraft('role', e.target.value)} /></label></div><label className="block space-y-1 text-xs"><span>{zh ? '职位描述 / 参考资料' : 'Job description / reference'}</span><Textarea disabled={creating} maxLength={40000} value={jobDescription} onChange={e => changeDraft('jobDescription', e.target.value)} /></label></div></details>
        {draftError && <p role="alert" className="text-xs text-destructive">{zh ? `本机草稿未能暂存或恢复，请保留此页重试：${draftError}` : `Local draft could not be saved or restored. Keep this page open and retry: ${draftError}`} <Button type="button" variant="ghost" size="sm" onClick={() => persistDraft({ ...draft, request: request.current })}>{zh ? '重试暂存' : 'Retry saving draft'}</Button></p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button variant="primary" size="sm" disabled={creating || !goal.trim()} type="submit"><Plus />{creating ? zh ? '正在准备…' : 'Preparing…' : error ? zh ? '重试准备版本' : 'Retry' : zh ? '准备版本并编辑' : 'Prepare and edit'}</Button>
      </form></section>}
      <section className="space-y-3"><h2 className="app-panel-title">{zh ? `已有定向稿 · ${targets.length}` : `Your versions · ${targets.length}`}</h2>{!targets.length ? <div className="app-panel app-empty"><FileText className="size-6" /><p>{zh ? '还没有定向稿。写一句需求，就能开始。' : 'No versions yet. Start with a short goal.'}</p></div> : targets.map(target => <article key={target.resumeId} className="app-panel"><div className="app-section-heading"><div className="min-w-0"><h3 className="app-panel-title break-words">{resumes.find(item => item.id === target.resumeId)?.title || (zh ? '定向稿' : 'Version')}</h3><p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{target.context?.goal}</p><p className="mt-2 text-[11px] text-muted-foreground">{[target.context?.company, target.context?.role].filter(Boolean).join(' · ')}</p></div><Button variant="outline" size="sm" onClick={() => router.push(`/editor/${target.resumeId}`)}>{zh ? '继续改稿' : 'Edit version'}<ArrowUpRight /></Button></div><p className="text-[11px] text-muted-foreground">{zh ? '创建时来源：' : 'Source at creation: '}{target.sourceTitle}{target.sourceMissing ? zh ? ' · 来源已删除，快照保留' : ' · Source deleted; snapshot retained' : target.sourceChanged ? zh ? ' · 来源已更新，此稿保留创建时内容' : ' · Source updated; this version retains its original content' : ''}</p></article>)}</section>
    </>}
  </div>;
}
