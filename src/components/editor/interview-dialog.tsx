'use client';

import { Textarea } from '@/components/ui/textarea';
import { WorkspaceAssistant } from '@/components/ai/workspace-assistant';
import { assertUnchanged, validateWorkspaceFields } from '@/lib/workspace-actions';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { listen } from '@tauri-apps/api/event';
import { Send, Square, Play, RotateCcw, BookmarkPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AIMessage } from '@/components/ai/ai-message';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { useJournalStore } from '@/stores/journal-store';
import * as api from '@/lib/tauri-api';
import { logError } from '@/stores/error-log-store';
import { generateId } from '@/lib/utils';
import type { UIMessage } from '@/types/chat';

interface StreamEvent {
  streamId: string;
  event:
    | { type: 'textDelta'; text: string }
    | { type: 'reasoningDelta'; text: string }
    | { type: 'finish'; finalText: string }
    | { type: 'error'; message: string };
}

const NO_APPLICATION = '__none__';

export function InterviewDialog() {
  const t = useTranslations('interview');
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const openSettings = useUIStore((s) => s.openModal);
  const isOpen = activeModal === 'interview';

  const resumeId = useResumeStore((s) => s.currentResume?.id);
  const applications = useJournalStore((s) => s.applications);
  const addMock = useJournalStore((s) => s.addMock);
  const toolPrefill = useEditorStore((s) => s.toolPrefill);
  const setToolPrefill = useEditorStore((s) => s.setToolPrefill);
  const channels = useSettingsStore((s) => s.channels);
  const activeChannelId = useSettingsStore((s) => s.activeChannelId);
  const selectChannel = useSettingsStore((s) => s.selectChannel);

  const [applicationId, setApplicationId] = useState<string>(NO_APPLICATION);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [round, setRound] = useState('');
  const [jd, setJd] = useState('');
  const [focus, setFocus] = useState('');
  const [selectedModel, setSelectedModel] = useState<string | undefined>();

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const streamRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const configuredChannels = channels.filter((c) => c.apiKey.trim() && c.baseURL.trim());
  const hasConfigured = configuredChannels.length > 0;
  const shortlist = activeChannel?.models ?? [];
  const modelValue = selectedModel || activeChannel?.model;
  const resumeApplications = applications.filter((a) => a.resumeId === resumeId);

  // 从某条投递发起：公司 / 岗位 / JD / 轮次直接带过来（打开时一次性消费）。
  useEffect(() => {
    if (!isOpen || !toolPrefill) return;
    setApplicationId(toolPrefill.applicationId ?? NO_APPLICATION);
    setCompany(toolPrefill.company ?? '');
    setRole(toolPrefill.role ?? '');
    setJd(toolPrefill.jd ?? '');
    setRound(toolPrefill.round ?? '');
    setToolPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const applyApplication = (id: string) => {
    setApplicationId(id);
    const app = applications.find((a) => a.id === id);
    if (!app) return;
    setCompany(app.company);
    setRole(app.role);
    setJd(app.jd);
    const upcoming = [...app.interviews]
      .filter((r) => r.scheduledAt && Date.parse(r.scheduledAt) >= Date.now())
      .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!))[0];
    setRound(upcoming?.round || app.interviews[app.interviews.length - 1]?.round || '');
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | undefined;
    listen<StreamEvent>('ai-chat-event', (e) => {
      const payload = e.payload;
      if (payload.streamId !== streamRef.current) return;
      const ev = payload.event;
      if (ev.type === 'textDelta') {
        setMessages((prev) => appendToLastAssistant(prev, ev.text));
      } else if (ev.type === 'finish') {
        setMessages((prev) => finalizeLastAssistant(prev, ev.finalText));
        streamRef.current = null;
        setIsLoading(false);
      } else if (ev.type === 'error') {
        streamRef.current = null;
        setIsLoading(false);
        logError(t('title'), typeof ev.message === 'string' ? ev.message : '');
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [isOpen, t]);

  const runTurn = useCallback(
    async (history: UIMessage[]) => {
      if (!hasConfigured) {
        openSettings('settings');
        return;
      }
      const streamId = generateId();
      streamRef.current = streamId;
      setIsLoading(true);
      setMessages([...history, { id: generateId(), role: 'assistant', parts: [{ type: 'text', text: '' }] }]);
      const backend = history.map((m) => ({
        role: m.role,
        content: m.content || m.parts.filter((p) => p.type === 'text').map((p: any) => p.text).join(''),
      }));
      try {
        await api.interviewChat({
          streamId,
          messages: backend,
          resumeId,
          company,
          role,
          jd,
          round,
          selectedModel,
        });
      } catch (err: any) {
        streamRef.current = null;
        setIsLoading(false);
        logError(t('title'), err?.message || String(err));
      }
    },
    [hasConfigured, openSettings, resumeId, company, role, jd, round, selectedModel, t]
  );

  const startInterview = () => {
    const first: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text: t('startTrigger') + (focus ? `\n本次练习要求：${focus}` : '') }] };
    void runTurn([first]);
  };

  const sendAnswer = () => {
    if (!input.trim() || isLoading) return;
    const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text: input }] };
    void runTurn([...messages.filter((m) => m.parts.some((p) => p.type === 'text' && p.text)), userMsg]);
    setInput('');
  };

  const stop = () => {
    if (streamRef.current) {
      void api.cancelAiStream(streamRef.current);
      streamRef.current = null;
      setIsLoading(false);
    }
  };

  const reset = () => {
    stop();
    setMessages([]);
  };

  const saveToJournal = async () => {
    if (!resumeId || messages.length === 0) return;
    const textOf = (m: UIMessage) =>
      m.content || m.parts.filter((p) => p.type === 'text').map((p: any) => p.text).join('');
    const assistantMsgs = messages.filter((m) => m.role === 'assistant' && textOf(m).trim());
    // 面试官最后一条通常是收尾评价，作为反馈存档。
    const feedback = assistantMsgs.length ? textOf(assistantMsgs[assistantMsgs.length - 1]) : '';
    const transcript = messages
      .map((m) => `【${m.role === 'user' ? '我' : '面试官'}】${textOf(m)}`)
      .join('\n\n');
    try {
      await addMock({
        resumeId,
        applicationId: applicationId === NO_APPLICATION ? null : applicationId,
        company: company.trim(),
        role: [role.trim(), round.trim()].filter(Boolean).join(' · '),
        feedback: feedback.slice(0, 4000),
        transcript: transcript.slice(0, 8000),
      });
      toast.success(t('archived'));
    } catch (err: any) {
      logError(t('title'), err?.message || String(err));
    }
  };

  const started = messages.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="flex h-[80vh] max-w-[900px] flex-col gap-0 p-0 sm:max-w-[900px]">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {!started && <div className="max-h-[42%] shrink-0 overflow-y-auto border-b p-3"><WorkspaceAssistant scope="mock" title="描述你想怎么练" placeholder="例如：按字节前端二面来练，重点追问我的项目架构，每次只问一道题…" examples={['根据我的投递记录帮我准备一次二面练习']}
          context={()=>({company,role,round,jd,focus,applications:resumeApplications.map(a=>({id:a.id,company:a.company,role:a.role,jd:a.jd.slice(0,12000),interviews:a.interviews}))})}
          onApply={async(actions,base)=>{if(started)throw Error('面试已经开始，请先结束本次练习');const b=base as {company:string;role:string;round:string;jd:string;focus:string};assertUnchanged({company:b.company,role:b.role,round:b.round,jd:b.jd,focus:b.focus},{company,role,round,jd,focus});for(const action of actions){validateWorkspaceFields(action);if(action.kind!=='mock')throw Error('不是模拟面试设置');for(const [key,value]of Object.entries(action.fields)){const set={company:setCompany,role:setRole,round:setRound,jd:setJd,focus:setFocus}[key];set?.(String(value));}}}}
        /></div>}
        <div className="flex min-h-0 flex-1">
          {/* 左：面试设置 */}
          <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border p-4">
            {resumeApplications.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('application')}</Label>
                <Select value={applicationId} onValueChange={applyApplication} disabled={started}>
                  <SelectTrigger size="sm" className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_APPLICATION} className="text-xs">{t('applicationNone')}</SelectItem>
                    {resumeApplications.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {[a.company, a.role].filter(Boolean).join(' · ') || t('applicationUntitled')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground">可以直接开始，面试官会先围绕简历提问。选择投递记录可自动带入公司与岗位。</p>
            {!started && <label className="space-y-1.5 text-xs">练习重点（可选）<Textarea value={focus} onChange={e=>setFocus(e.target.value)} rows={2} placeholder="追问项目取舍、系统设计，或先从基础题开始" /></label>}
            <details open={!!company || !!role || !!jd} className="space-y-3"><summary className="cursor-pointer text-xs font-medium">补充面试方向（可选）</summary><div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('company')}</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t('companyPlaceholder')} disabled={started} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('role')}</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t('rolePlaceholder')} disabled={started} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('round')}</Label>
              <Input value={round} onChange={(e) => setRound(e.target.value)} placeholder={t('roundPlaceholder')} disabled={started} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
              <Label className="text-xs">{t('jd')}</Label>
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                placeholder={t('jdPlaceholder')}
                disabled={started}
                className="min-h-[120px] flex-1 resize-none rounded-md border border-border bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--app-text-muted)] disabled:opacity-60"
              />
            </div>

            </div></details>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('channel')}</Label>
              {hasConfigured ? (
                <Select value={activeChannelId ?? undefined} onValueChange={(v) => { selectChannel(v); setSelectedModel(undefined); }}>
                  <SelectTrigger size="sm" className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {configuredChannels.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button variant="outline" size="sm" className="w-full cursor-pointer text-xs" onClick={() => openSettings('settings')}>
                  {t('needChannel')}
                </Button>
              )}
            </div>
            {hasConfigured && shortlist.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('model')}</Label>
                <Select value={modelValue} onValueChange={setSelectedModel}>
                  <SelectTrigger size="sm" className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {shortlist.map((m) => (<SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="mt-1 flex flex-col gap-2">
              <Button
                onClick={started ? reset : startInterview}
                disabled={isLoading && !started}
                className="w-full cursor-pointer gap-1.5"
              >
                {started ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {started ? t('restart') : t('start')}
              </Button>
              {started && (
                <Button
                  variant="outline"
                  onClick={() => void saveToJournal()}
                  disabled={isLoading}
                  className="w-full cursor-pointer gap-1.5"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  {t('saveToJournal')}
                </Button>
              )}
            </div>
          </div>

          {/* 右：对话 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[var(--app-text-muted)]">
                  {t('emptyHint')}
                </div>
              ) : (
                messages.map((m, i) => (
                  <AIMessage
                    key={m.id}
                    message={m}
                    isStreaming={isLoading && m.role === 'assistant' && i === messages.length - 1}
                  />
                ))
              )}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); sendAnswer(); }}
              className="border-t border-border p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={started ? t('answerPlaceholder') : t('startFirst')}
                  disabled={!started}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      sendAnswer();
                    }
                  }}
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--app-text-muted)] disabled:opacity-50"
                />
                {isLoading ? (
                  <Button type="button" onClick={stop} variant="outline" size="icon" className="h-10 w-10 shrink-0 cursor-pointer">
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={!started || !input.trim()} size="icon" className="h-10 w-10 shrink-0 cursor-pointer">
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function appendToLastAssistant(prev: UIMessage[], text: string): UIMessage[] {
  if (prev.length === 0) return prev;
  const out = [...prev];
  const last = out[out.length - 1];
  if (last.role !== 'assistant') return prev;
  const parts = [...last.parts];
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === 'text') {
    parts[parts.length - 1] = { type: 'text', text: lastPart.text + text };
  } else {
    parts.push({ type: 'text', text });
  }
  out[out.length - 1] = { ...last, parts };
  return out;
}

function finalizeLastAssistant(prev: UIMessage[], finalText: string): UIMessage[] {
  if (prev.length === 0) return prev;
  const out = [...prev];
  const last = out[out.length - 1];
  if (last.role !== 'assistant') return prev;
  const current = last.parts.filter((p) => p.type === 'text').map((p: any) => p.text).join('');
  if (!current && finalText) {
    out[out.length - 1] = { ...last, parts: [{ type: 'text', text: finalText }], content: finalText };
  } else {
    out[out.length - 1] = { ...last, content: current };
  }
  return out;
}
