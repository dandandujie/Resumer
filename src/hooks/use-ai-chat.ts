import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import * as api from '@/lib/tauri-api';
import { useResumeStore } from '@/stores/resume-store';
import { useProposalsStore, isMutationTool } from '@/stores/proposals-store';
import { generateId } from '@/lib/utils';
import type { UIMessage, MessagePart } from '@/types/chat';
import type { ResumeSection } from '@/types/resume';

export type { UIMessage, MessagePart };

interface UseAIChatOptions {
  resumeId: string;
  sessionId?: string;
  initialMessages?: UIMessage[];
  selectedModel?: string;
}

interface StreamEvent {
  streamId: string;
  event:
    | { type: 'textDelta'; text: string }
    | { type: 'reasoningDelta'; text: string }
    | { type: 'toolCallStart'; id: string; name: string }
    | { type: 'toolCallArgs'; id: string; args: unknown }
    | { type: 'toolResult'; id: string; name: string; result: unknown }
    | { type: 'knowledgeProposal'; path: string; content: string; reason: string; proposalId: string }
    | { type: 'finish'; finalText: string }
    | { type: 'error'; message: string };
}

export function useAIChat({ resumeId, sessionId, initialMessages, selectedModel }: UseAIChatOptions) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [localMessages, setLocalMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming'>('idle');
  const [error, setError] = useState<Error | null>(null);

  const isLoading = status === 'streaming' || status === 'submitted';
  const streamIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (streamIdRef.current) {
      void api.cancelAiStream(streamIdRef.current);
    }
  }, []);
  const assistantMsgIdRef = useRef<string | null>(null);
  // Tracks pending mutation tool calls so we can snapshot before/after for proposals
  const pendingMutationsRef = useRef<
    Map<
      string,
      {
        name: string;
        beforeSections: ResumeSection[];
        args: Record<string, unknown>;
        messageId: string;
      }
    >
  >(new Map());
  // Buffer text deltas in a ref so we can throttle setMessages updates.
  // Streaming providers can fire 100+ deltas/sec — without this each token
  // would trigger a full React re-render of the chat list.
  const textBufferRef = useRef<string>('');
  const reasoningBufferRef = useRef<string>('');
  const flushTimerRef = useRef<number | null>(null);

  const flushTextBuffer = useCallback(() => {
    // Reasoning deltas flush before text so a think block always precedes the
    // answer it produced.
    const reasoningChunk = reasoningBufferRef.current;
    if (reasoningChunk) {
      reasoningBufferRef.current = '';
      setMessages((prev) => {
        const msgId = assistantMsgIdRef.current;
        if (!msgId) return prev;
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx === -1) return prev;
        const msg = { ...prev[idx] };
        const parts = [...msg.parts];
        const lastPart = parts[parts.length - 1];
        if (lastPart?.type === 'reasoning') {
          parts[parts.length - 1] = { ...lastPart, text: lastPart.text + reasoningChunk };
        } else {
          parts.push({ type: 'reasoning', text: reasoningChunk, startedAt: Date.now() });
        }
        msg.parts = parts;
        const out = [...prev];
        out[idx] = msg;
        return out;
      });
    }
    const chunk = textBufferRef.current;
    if (!chunk) return;
    textBufferRef.current = '';
    setMessages((prev) => {
      const msgId = assistantMsgIdRef.current;
      if (!msgId) return prev;
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      const msg = { ...prev[idx] };
      const parts = [...msg.parts];
      const lastPart = parts[parts.length - 1];
      if (lastPart?.type === 'text') {
        parts[parts.length - 1] = { type: 'text', text: lastPart.text + chunk };
      } else {
        if (lastPart?.type === 'reasoning' && !lastPart.endedAt) {
          parts[parts.length - 1] = { ...lastPart, endedAt: Date.now() };
        }
        parts.push({ type: 'text', text: chunk });
      }
      msg.parts = parts;
      const out = [...prev];
      out[idx] = msg;
      return out;
    });
  }, []);

  // Hydrate initial messages
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Reload resume data after tool execution changes DB

  // Subscribe to Tauri streaming events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<StreamEvent>('ai-chat-event', (evt) => {
      const payload = evt.payload;
      if (!payload) return;
      if (payload.event.type !== 'knowledgeProposal' && payload.streamId !== streamIdRef.current) return;

      // Fast path for text deltas: buffer them and schedule one flush per frame.
      // This drops re-renders from per-token to ~25fps, which the React DOM
      // can keep up with even on long responses.
      if (payload.event.type === 'textDelta' || payload.event.type === 'reasoningDelta') {
        if (payload.event.type === 'textDelta') {
          textBufferRef.current += payload.event.text;
          setStatus('streaming');
        } else {
          reasoningBufferRef.current += payload.event.text;
          setStatus('streaming');
        }
        if (flushTimerRef.current === null) {
          flushTimerRef.current = window.setTimeout(() => {
            flushTimerRef.current = null;
            flushTextBuffer();
          }, 40);
        }
        return;
      }

      // Any non-text event flushes pending text first so ordering stays correct.
      if (textBufferRef.current || reasoningBufferRef.current) {
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        flushTextBuffer();
      }

      setMessages((prev) => {
        const msgId = assistantMsgIdRef.current;
        if (!msgId) return prev;
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx === -1) return prev;
        const msg = { ...prev[idx] };
        const parts = [...msg.parts];

        switch (payload.event.type) {
          case 'knowledgeProposal': {
            parts.push({
              type: 'tool',
              toolName: 'knowledgeProposal',
              toolCallId: payload.event.proposalId,
              args: {},
              result: payload.event,
              state: 'output-available',
            });
            break;
          }
          case 'toolCallStart': {
            parts.push({ type: 'tool', toolName: payload.event.name, toolCallId: payload.event.id, args: {}, state: 'input-available' });
            if (isMutationTool(payload.event.name)) {
              // Snapshot resume sections BEFORE the backend executes the tool
              // Note: we deep clone here and cache in pendingMutations to avoid double-cloning later
              const snapshot = useResumeStore.getState().sections.map((s) => ({
                ...s,
                content: structuredClone(s.content)
              }));
              pendingMutationsRef.current.set(payload.event.id, {
                name: payload.event.name,
                beforeSections: snapshot,
                args: {},
                messageId: msgId,
              });
            }
            break;
          }
          case 'toolCallArgs': {
            // Update tool part matching this id with args
            for (let i = parts.length - 1; i >= 0; i--) {
              if (parts[i].type === 'tool' && (parts[i] as any).toolCallId === payload.event.id) {
                parts[i] = { ...parts[i], args: payload.event.args } as MessagePart;
                break;
              }
            }
            const pending = pendingMutationsRef.current.get(payload.event.id);
            if (pending) {
              pending.args = (payload.event.args as Record<string, unknown>) || {};
            }
            break;
          }
          case 'toolResult': {
            const toolResultId = payload.event.id;
            for (let i = parts.length - 1; i >= 0; i--) {
              const p = parts[i];
              if (p.type === 'tool' && (p as any).toolCallId === toolResultId) {
                parts[i] = { ...p, result: payload.event.result, state: 'output-available' };
                break;
              }
            }
            // Trigger resume reload, then push a proposal so the user can accept/reject
            const pending = pendingMutationsRef.current.get(toolResultId);
            if (pending) {
              pendingMutationsRef.current.delete(toolResultId);
              const result = payload.event.result as { proposalOnly?: boolean; beforeSections?: ResumeSection[]; afterSections?: ResumeSection[] };
              if (result.proposalOnly && Array.isArray(result.afterSections)) {
                useProposalsStore.getState().addProposal({
                  id: toolResultId, resumeId, messageId: pending.messageId, toolName: pending.name,
                  toolCallId: toolResultId, args: pending.args,
                  beforeSections: result.beforeSections || pending.beforeSections,
                  afterSections: result.afterSections, createdAt: Date.now(),
                });
              }
            }
            break;
          }
          case 'finish': {
            // Drain any remaining buffered text before the state flips to idle
            setStatus('idle');
            break;
          }
          case 'error': {
            setError(new Error(payload.event.message));
            setStatus('idle');
            break;
          }
        }

        msg.parts = parts;
        const out = [...prev];
        out[idx] = msg;
        return out;
      });
    }).then((un) => {
      if (cancelled) { un(); return; }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [flushTextBuffer, resumeId]);

  const sendMessage = useCallback(
    async (data: { text: string }) => {
      setError(null);
      setStatus('submitted');

      const userMsg: UIMessage = {
        id: generateId(),
        role: 'user',
        parts: [{ type: 'text', text: data.text }],
        content: data.text,
      };
      const assistantMsg: UIMessage = {
        id: generateId(),
        role: 'assistant',
        parts: [],
      };

      const prevMessages = messages;
      setMessages([...prevMessages, userMsg, assistantMsg]);
      assistantMsgIdRef.current = assistantMsg.id;

      const streamId = generateId();
      streamIdRef.current = streamId;

      // Build messages for backend — convert parts to plain content
      const backendMessages = [...prevMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.content || m.parts.filter((p) => p.type === 'text').map((p: any) => p.text).join(''),
      }));

      setStatus('streaming');
      try {
        // 投递上下文由后端直接从库里读，前端不再拼字符串。
        await api.aiChat({
          streamId,
          messages: backendMessages,
          resumeId,
          sessionId,
          selectedModel,
          draft: useResumeStore.getState().currentResume,
        });
      } catch (err: any) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('idle');
      }
    },
    [messages, resumeId, sessionId, selectedModel]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim()) return;

      if (!api.isAIConfigured()) {
        const userMsg: UIMessage = { id: generateId(), role: 'user', parts: [{ type: 'text', text: input }] };
        const errorMsg: UIMessage = {
          id: generateId(),
          role: 'assistant',
          parts: [{ type: 'text', text: '__API_KEY_MISSING__' }],
        };
        setLocalMessages((prev) => [...prev, userMsg, errorMsg]);
        setInput('');
        return;
      }

      if (localMessages.length > 0) setLocalMessages([]);
      sendMessage({ text: input });
      setInput('');
    },
    [input, localMessages, sendMessage]
  );

  const allMessages = useMemo(
    () => (localMessages.length > 0 ? [...messages, ...localMessages] : messages),
    [messages, localMessages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLocalMessages([]);
  }, []);

  return {
    messages: allMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    status,
    error,
    clearMessages,
    sendMessage,
    stop,
  };
}
