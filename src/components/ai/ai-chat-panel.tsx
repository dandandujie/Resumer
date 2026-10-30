'use client';

import type { UIMessage } from '@/types/chat';
import { useTranslations } from 'next-intl';
import { X, Sparkles, Plus, Trash2, Clock, MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logError } from '@/stores/error-log-store';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { useAIChat } from '@/hooks/use-ai-chat';
import { useMessagePagination } from '@/hooks/use-message-pagination';
import { AIMessage } from './ai-message';
import { AIInput } from './ai-input';
import * as api from '@/lib/tauri-api';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: Date | number | null;
}

interface AIChatContentProps {
  resumeId: string;
  hideTitle?: boolean;
}

function formatTime(date: Date | number | null) {
  if (!date) return '';
  // DB timestamps are unix SECONDS; JS Date wants ms. Values below 1e12
  // (before 2001 in ms) are second-precision and need scaling.
  const d =
    date instanceof Date
      ? date
      : new Date(typeof date === 'number' && date < 1e12 ? date * 1000 : date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} · ${h}:${min}`;
}

/** Headless chat body — reusable in both side panel and floating bubble */
export function AIChatContent({ resumeId, hideTitle }: AIChatContentProps) {
  const t = useTranslations('ai');
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>();
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { historicalMessages, hasMore, isLoadingMore, loadInitial, loadMore, reset: resetPagination } = useMessagePagination();

  const settingsModel = useSettingsStore((s) => s.aiModel);
  const channels = useSettingsStore((s) => s.channels);
  const activeChannelId = useSettingsStore((s) => s.activeChannelId);
  const selectChannel = useSettingsStore((s) => s.selectChannel);
  const openSettings = useUIStore((s) => s.openModal);

  // 模型选择器只展示当前渠道的常用模型列表；没配常用列表就提示去设置，不再每次打开都去拉全量模型。
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const shownModels = useMemo(() => activeChannel?.models ?? [], [activeChannel]);
  const needsModelSetup = !!activeChannel && !!activeChannel.apiKey.trim() && shownModels.length === 0;
  const effectiveModel = selectedModel && shownModels.includes(selectedModel) ? selectedModel : settingsModel;

  const createNewSession = useCallback(async (isInitial = false) => {
    try {
      const newId = await api.createChatSession(resumeId);
      const newSession = await api.getChatSession(newId);
      if (newSession) {
        setSessions((prev) => [{ id: newSession.id, title: newSession.title, updatedAt: newSession.updatedAt }, ...prev]);
        setActiveSessionId(newSession.id);
        resetPagination();
        setInitialMessages([]);
        if (isInitial) {
          setSessionsLoaded(true);
        }
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [resumeId, resetPagination]);

  // Fetch sessions on mount
  useEffect(() => {
    api
      .listChatSessions(resumeId)
      .then(async (sessions: ChatSession[]) => {
        if (sessions.length > 0) {
          setSessions(sessions);
          const mostRecent = sessions[0];
          setActiveSessionId(mostRecent.id);
          const msgs = await loadInitial(mostRecent.id);
          setInitialMessages(msgs);
        } else {
          await createNewSession(true);
        }
        setSessionsLoaded(true);
      })
      .catch(() => {
        setSessionsLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);


  const switchSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setHistoryOpen(false);
    const msgs = await loadInitial(sessionId);
    setInitialMessages(msgs);
  }, [activeSessionId, loadInitial]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await api.deleteChatSession(sessionId);
    } catch (err) {
      console.error('Failed to delete session:', err);
      return;
    }

    // Remove from state (pure updater — no side effects)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    // Handle active session switch outside the updater to avoid Strict Mode double-invocation
    if (sessionId === activeSessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      if (remaining.length > 0) {
        const nextId = remaining[0].id;
        setActiveSessionId(nextId);
        loadInitial(nextId).then((msgs) => setInitialMessages(msgs));
      } else {
        await createNewSession();
      }
    }
  }, [activeSessionId, sessions, loadInitial, createNewSession]);

  const { messages: chatMessages, input, setInput, handleInputChange, handleSubmit: originalHandleSubmit, isLoading, status, error: chatError, sendMessage, stop } = useAIChat({
    resumeId,
    sessionId: activeSessionId,
    initialMessages,
    selectedModel: effectiveModel,
  });

  // Message actions — edit-resend / rollback / regenerate (same as global agent).
  const handleRollback = useCallback(
    async (messageId: string) => {
      if (!activeSessionId) return;
      try {
        await api.truncateChatMessages(activeSessionId, messageId);
        const msgs = await loadInitial(activeSessionId);
        setInitialMessages(msgs);
      } catch (err: any) {
        logError(t('errorMessage'), err?.message || String(err));
      }
    },
    [activeSessionId, loadInitial, t]
  );

  const handleEditResend = useCallback(
    (messageId: string, text: string) => {
      void handleRollback(messageId).then(() => setInput(text));
    },
    [handleRollback, setInput]
  );

  const handleRegenerate = useCallback(
    (assistantMessageId: string) => {
      const list = chatMessages;
      const idx = list.findIndex((m) => m.id === assistantMessageId);
      if (idx <= 0) return;
      // Find the user message right before this assistant reply.
      let userIdx = idx - 1;
      while (userIdx >= 0 && list[userIdx].role !== 'user') userIdx -= 1;
      if (userIdx < 0) return;
      const userMsg = list[userIdx];
      const text = (userMsg.parts || [])
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');
      void handleRollback(userMsg.id).then(() => {
        if (text.trim()) sendMessage({ text });
      });
    },
    [chatMessages, handleRollback, sendMessage]
  );

  // Show toast when AI API call fails
  const lastErrorRef = useRef<Error | null>(null);
  useEffect(() => {
    if (chatError && chatError !== lastErrorRef.current) {
      lastErrorRef.current = chatError;
      const msg = chatError.message || t('errorMessage');
      // Route to the bottom-left error log (with a friendlier hint for common cases).
      if (msg.includes('ETIMEDOUT') || msg.includes('Cannot connect')) {
        logError(t('errorMessage'), 'API 连接超时，请检查网络或 API 配置');
      } else if (msg.includes('No tool call found')) {
        logError(t('errorMessage'), 'AI 模型返回了无效的工具调用，请重试');
      } else {
        logError(t('errorMessage'), msg);
      }
    }
  }, [chatError, t]);

  // Handle pending AI message from other components (grammar one-click fix,
  // JD optimize, derive-tailored-copy handoff). Targeted messages only fire in
  // the matching resume's editor; stale mismatches are discarded.
  const pendingAiMessage = useEditorStore((s) => s.pendingAiMessage);
  const setPendingAiMessage = useEditorStore((s) => s.setPendingAiMessage);
  useEffect(() => {
    if (pendingAiMessage && sessionsLoaded && activeSessionId) {
      if (!pendingAiMessage.resumeId || pendingAiMessage.resumeId === resumeId) {
        sendMessage({ text: pendingAiMessage.text });
      }
      setPendingAiMessage(null);
    }
  }, [pendingAiMessage, sessionsLoaded, activeSessionId, sendMessage, setPendingAiMessage, resumeId]);

  // Merge historical (paginated older) + chat (current session) messages, dedup by id
  const displayMessages = useMemo(() => {
    if (historicalMessages.length === 0) return chatMessages;
    const chatIds = new Set(chatMessages.map((m) => m.id));
    const olderOnly = historicalMessages.filter((m) => !chatIds.has(m.id));
    return [...olderOnly, ...chatMessages];
  }, [historicalMessages, chatMessages]);

  // Wrap handleSubmit to update session title on first message
  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    if (activeSession && activeSession.title === '新对话' && input.trim()) {
      const newTitle = input.trim().slice(0, 50);
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: newTitle } : s))
      );
    }
    originalHandleSubmit(e);
  }, [sessions, activeSessionId, input, originalHandleSubmit]);

  // Smart auto-scroll: only scroll to bottom when user is near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages, isLoading]);

  // Track scroll position + trigger loadMore on scroll near top
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
      if (scrollTop < 50 && hasMore && !isLoadingMore) {
        loadMore(scrollRef);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore, loadMore]);

  return (
    <>
      {/* Header bar */}
      <div className={`flex items-center ${hideTitle ? 'justify-end' : 'justify-between'} border-b px-4 py-3`}>
        {!hideTitle && (
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-foreground">{t('panelTitle')}</h3>
          </div>
        )}
        <div className="flex items-center gap-1">
          {/* History popover */}
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 cursor-pointer p-0"
              >
                <Clock className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
              <div className="max-h-80 overflow-y-auto">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="group flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted"
                    onClick={() => switchSession(session.id)}
                  >
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {session.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatTime(session.updatedAt)}
                      </p>
                    </div>
                    <button
                      className="mt-0.5 hidden shrink-0 rounded p-1 text-muted-foreground hover:bg-[var(--app-hover)] hover:text-foreground group-hover:block"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {t('defaultGreeting')}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0"
            onClick={() => createNewSession()}
            title={t('newChat')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Loading more indicator */}
          {isLoadingMore && (
            <div className="py-2 text-center text-xs text-muted-foreground">
              {t('loadingMore')}
            </div>
          )}
          {hasMore && !isLoadingMore && (
            <button
              className="w-full py-2 text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => loadMore(scrollRef)}
            >
              {t('loadMore')}
            </button>
          )}
          {displayMessages.length === 0 && (
            <div className="relative overflow-hidden rounded-[10px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-[13px] leading-relaxed text-[var(--app-text-secondary)]">
              <div className="relative flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />
                <span>{t('defaultGreeting')}</span>
              </div>
            </div>
          )}
          {displayMessages.map((message, i) => (
            <AIMessage
              key={message.id}
              message={message}
              isStreaming={
                status === 'streaming' &&
                message.role === 'assistant' &&
                i === displayMessages.length - 1
              }
              onEditResend={handleEditResend}
              onRollback={handleRollback}
              onRegenerate={handleRegenerate}
            />
          ))}
          {status === 'submitted' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:300ms]" />
              </span>
              {t('thinking')}
            </div>
          )}
          {chatError && status !== 'streaming' && status !== 'submitted' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {t('errorMessage')}
            </div>
          )}
        </div>
      </div>

      <AIInput
        input={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        models={shownModels}
        channels={channels}
        activeChannelId={activeChannelId}
        needsModelSetup={needsModelSetup}
        onSelectChannel={(id) => {
          selectChannel(id);
          setSelectedModel(undefined);
        }}
        onOpenSettings={() => openSettings('settings')}
        selectedModel={selectedModel}
        effectiveModel={effectiveModel}
        onModelChange={setSelectedModel}
        onStop={stop}
      />
    </>
  );
}

/** Side-panel wrapper (backward compat) */
export function AIChatPanel({ resumeId }: { resumeId: string }) {
  const { toggleAiChat } = useEditorStore();

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-card">
      <AIChatContent resumeId={resumeId} />
      {/* Close button overlaid on the header */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 h-7 w-7 cursor-pointer p-0"
        onClick={toggleAiChat}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
