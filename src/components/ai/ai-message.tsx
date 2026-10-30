'use client';

import {
  Bot,
  User,
  AlertTriangle,
  Settings,
  Wand2,
  Brain,
  ChevronDown,
  Pencil,
  RotateCcw,
  Scissors,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useTranslations } from 'next-intl';
import type { UIMessage, MessagePart } from '@/types/chat';
import { useUIStore } from '@/stores/ui-store';
import { useProposalsStore, isMutationTool } from '@/stores/proposals-store';
import { AIProposalCard, KnowledgeProposalCard } from './ai-proposal-card';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import * as api from '@/lib/tauri-api';
import { toast } from 'sonner';
import { logError } from '@/stores/error-log-store';

interface AIMessageProps {
  message: UIMessage;
  /** True for the assistant message currently being streamed.
   *  Skips markdown rendering (uses plain &lt;pre&gt;) to keep re-render cost low. */
  isStreaming?: boolean;
  /** CherryStudio-style message actions (optional per host). */
  onEditResend?: (messageId: string, text: string) => void;
  onRollback?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
}

/** An assistant message with no renderable content yet (waiting for the first
 *  token) — skip the bubble entirely; the typing indicator covers this state. */
function hasRenderableContent(message: UIMessage): boolean {
  return (message.parts || []).some((p) => {
    if (p.type === 'text' || p.type === 'reasoning')
      return p.text.trim().length > 0;
    return true; // tool parts always render
  });
}

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

const htmlVisualTags = [
  'div',
  'span',
  'details',
  'summary',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'br',
  'hr',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'pre',
];

const htmlVisualSanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([...(defaultSchema.tagNames || []), ...htmlVisualTags]),
  ),
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)[
        '*'
      ] || []),
      'style',
      'title',
    ],
    details: [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)[
        'details'
      ] || []),
      'open',
      'style',
    ],
    th: [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)[
        'th'
      ] || []),
      'colspan',
      'rowspan',
      'style',
    ],
    td: [
      ...(((defaultSchema.attributes || {}) as Record<string, unknown[]>)[
        'td'
      ] || []),
      'colspan',
      'rowspan',
      'style',
    ],
  },
};

function readCssSize(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) return null;
  if (trimmed.endsWith('rem')) return numeric * 16;
  if (trimmed.endsWith('em')) return numeric * 14;
  if (trimmed.endsWith('px') || /^\d+(\.\d+)?$/.test(trimmed)) return numeric;
  if (trimmed.endsWith('vh')) return (numeric / 100) * 900;
  if (trimmed.endsWith('vw')) return (numeric / 100) * 1440;
  return null;
}

function compactVisualStyle(
  style: unknown,
  element: 'block' | 'inline' | 'table' = 'block',
): CSSProperties {
  const next: CSSProperties =
    style && typeof style === 'object' ? { ...(style as CSSProperties) } : {};

  const height = readCssSize(next.height);
  const minHeight = readCssSize(next.minHeight);
  const width = readCssSize(next.width);
  const minWidth = readCssSize(next.minWidth);
  const fontSize = readCssSize(next.fontSize);

  if (
    height === null &&
    typeof next.height === 'string' &&
    /vh|vw|%|calc|min|max/.test(next.height)
  ) {
    next.height = 'auto';
  } else if (height !== null && height > 260) {
    next.height = 'auto';
  }

  if (
    minHeight === null &&
    typeof next.minHeight === 'string' &&
    /vh|vw|%|calc|min|max/.test(next.minHeight)
  ) {
    next.minHeight = undefined;
  } else if (minHeight !== null && minHeight > 180) {
    next.minHeight = undefined;
  }

  if (
    width === null &&
    typeof next.width === 'string' &&
    /vw/.test(next.width)
  ) {
    next.width = '100%';
  } else if (width !== null && width > 980) {
    next.width = '100%';
  }

  if (minWidth !== null && minWidth > 720) {
    next.minWidth = undefined;
  }

  if (
    next.position === 'fixed' ||
    next.position === 'sticky' ||
    next.position === 'absolute'
  ) {
    next.position = 'relative';
    next.inset = undefined;
    next.top = undefined;
    next.right = undefined;
    next.bottom = undefined;
    next.left = undefined;
    next.zIndex = undefined;
  }

  if (fontSize !== null && fontSize > 24) {
    next.fontSize = '16px';
  }

  for (const key of [
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
  ] as const) {
    const size = readCssSize(next[key]);
    if (size !== null && size > 28) next[key] = '12px' as never;
  }

  next.transform = undefined;
  next.scale = undefined;
  next.translate = undefined;
  next.rotate = undefined;
  next.backgroundImage = undefined;
  if (next.whiteSpace === 'nowrap') next.whiteSpace = 'normal';

  if (element !== 'inline') {
    next.maxWidth = '100%';
    next.boxSizing = 'border-box';
    next.overflowX = 'auto';
  }

  if (element === 'table') {
    next.width = '100%';
    next.borderCollapse = next.borderCollapse || 'collapse';
  }

  return next;
}

function cleanAssistantText(text: string): string {
  return text
    .replace(
      /^.*You[’']ve used\s+~?\d+[×x]\s+more tokens than Animal Farm\.\s*$/gim,
      '',
    )
    .replace(/\bdashboard\.thinking\b/g, '')
    .trim();
}

const markdownComponents = {
  div: ({ node: _node, style, ...props }: any) => (
    <div {...props} style={compactVisualStyle(style)} />
  ),
  span: ({ node: _node, style, ...props }: any) => (
    <span {...props} style={compactVisualStyle(style, 'inline')} />
  ),
  p: ({ node: _node, style, ...props }: any) => (
    <p {...props} style={compactVisualStyle(style)} />
  ),
  ul: ({ node: _node, style, ...props }: any) => (
    <ul {...props} style={compactVisualStyle(style)} />
  ),
  ol: ({ node: _node, style, ...props }: any) => (
    <ol {...props} style={compactVisualStyle(style)} />
  ),
  li: ({ node: _node, style, ...props }: any) => (
    <li {...props} style={compactVisualStyle(style)} />
  ),
  details: ({ node: _node, style, ...props }: any) => (
    <details {...props} style={compactVisualStyle(style)} />
  ),
  summary: ({ node: _node, style, ...props }: any) => (
    <summary {...props} style={compactVisualStyle(style)} />
  ),
  table: ({ node: _node, style, ...props }: any) => (
    <table {...props} style={compactVisualStyle(style, 'table')} />
  ),
  thead: ({ node: _node, style, ...props }: any) => (
    <thead {...props} style={compactVisualStyle(style, 'table')} />
  ),
  tbody: ({ node: _node, style, ...props }: any) => (
    <tbody {...props} style={compactVisualStyle(style, 'table')} />
  ),
  tr: ({ node: _node, style, ...props }: any) => (
    <tr {...props} style={compactVisualStyle(style, 'table')} />
  ),
  th: ({ node: _node, style, ...props }: any) => (
    <th {...props} style={compactVisualStyle(style, 'table')} />
  ),
  td: ({ node: _node, style, ...props }: any) => (
    <td {...props} style={compactVisualStyle(style, 'table')} />
  ),
};

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === 'tool';
}

/** Compact pill rendered while a non-mutation tool is running.
 *  Mutation tools get a full ProposalCard instead — see below. */
function ToolPill({ part }: { part: ToolPart }) {
  const t = useTranslations('ai');
  const state = part.state;
  const isCompleted = state === 'output-available' || state === 'output-error';

  return (
    <div className="my-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-2.5 py-0.5 text-[11px] text-[var(--app-text-muted)]">
      {!isCompleted && (
        <span className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--app-border)] border-t-[var(--app-accent)]" />
      )}
      {isCompleted && (
        <Wand2 className="h-2.5 w-2.5 shrink-0 text-[var(--app-accent)]" />
      )}
      <span>
        {t('toolCalling') || '正在调用'} {part.toolName}
      </span>
    </div>
  );
}

function WebSearchSources({ result }: { result: unknown }) {
  const t = useTranslations('ai');
  const value =
    result && typeof result === 'object'
      ? (result as { results?: unknown }).results
      : null;
  const results = Array.isArray(value) ? value : [];
  if (results.length === 0) return null;
  return (
    <div className="my-2 space-y-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-xs">
      <div className="font-medium text-[var(--app-text)]">{t('sources')}</div>
      {results.slice(0, 5).map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const source = item as {
          title?: string;
          url?: string;
          content?: string;
        };
        const save = async () => {
          const slug = (source.title || 'web-source').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'web-source';
          const text = `# ${source.title || source.url}\n\n${t('sourceOrigin')}: ${source.url || ''}\n\n${source.content || ''}`;
          try {
            await api.knowledgeIngestFile(Array.from(new TextEncoder().encode(text)), `${slug}.md`);
            toast.success(t('savedToKnowledge'));
          } catch (error) {
            logError(t('saveToKnowledgeFailed'), String((error as Error)?.message || error));
          }
        };
        return (
          <div key={`${source.url || 'source'}-${index}`} className="rounded px-1.5 py-1 hover:bg-muted">
            <a href={source.url} target="_blank" rel="noreferrer" className="block">
              <div className="truncate font-medium text-[var(--app-text)]">{source.title || source.url}</div>
              <div className="line-clamp-2 text-[var(--app-text-muted)]">{source.content}</div>
            </a>
            <button
              type="button"
              onClick={() => void save()}
              className="mt-1 cursor-pointer text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            >
              {t('saveToKnowledge')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ToolBlock({ part }: { part: ToolPart }) {
  const toolCallId = (part as any).toolCallId as string | undefined;
  const hasPendingProposal = useProposalsStore((s) =>
    toolCallId ? s.proposals.some((p) => p.toolCallId === toolCallId) : false,
  );

  if (part.toolName === 'webSearch' && part.state === 'output-available') {
    return <WebSearchSources result={part.result} />;
  }
  if (part.toolName === 'knowledgeProposal' && part.state === 'output-available') {
    const proposal = part.result as { path?: string; content?: string; reason?: string };
    return (
      <KnowledgeProposalCard
        path={proposal.path || ''}
        content={proposal.content || ''}
        reason={proposal.reason || ''}
      />
    );
  }

  // If this is a pending mutation, surface the proposal card (the only UI the user sees).
  if (hasPendingProposal && toolCallId) {
    return <AIProposalCard toolCallId={toolCallId} />;
  }

  // Mutation tool already accepted/rejected — render nothing.
  if (isMutationTool(part.toolName)) {
    return null;
  }

  // Non-mutation tools (e.g. analyzeJdMatch): show a tiny status pill while running, hide when done.
  if (part.state === 'output-available') {
    return null;
  }
  return <ToolPill part={part} />;
}

function APIKeyMissingCard() {
  const t = useTranslations('ai');
  const { openModal, setSettingsTab } = useUIStore();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-[13px] font-medium">{t('apiKeyMissing')}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-amber-600">
        {t('apiKeyMissingHint')}
      </p>
      <button
        type="button"
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-200"
        onClick={() => {
          setSettingsTab('ai');
          openModal('settings');
        }}
      >
        <Settings className="h-3.5 w-3.5" />
        {t('goToSettings')}
      </button>
    </div>
  );
}

function AIMessageImpl({
  message,
  isStreaming,
  onEditResend,
  onRollback,
  onRegenerate,
}: AIMessageProps) {
  const t = useTranslations('ai');
  const isUser = message.role === 'user';

  if (!isUser && !hasRenderableContent(message)) return null;

  const userText = isUser
    ? (message.parts || [])
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('')
    : '';

  const rollbackDisabled = isStreaming;
  const actionButtons =
    !rollbackDisabled && (isUser ? onEditResend || onRollback : onRegenerate);

  return (
    <div
      className={`group/msg flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-[var(--app-hover)]' : 'bg-[var(--app-accent-soft)]'
        }`}
      >
        {isUser ? (
          <User className="h-3 w-3 text-[var(--app-text-secondary)]" />
        ) : (
          <Bot className="h-3 w-3 text-[var(--app-text-secondary)]" />
        )}
      </div>
      <div
        className={`flex min-w-0 flex-col gap-1 ${isUser ? 'items-end max-w-[min(720px,calc(100%-2.5rem))]' : 'items-start max-w-[calc(100%-2.5rem)]'}`}
      >
        <div
          className={`min-w-0 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed ${
            isUser
              ? 'bg-[var(--app-surface)] text-[var(--app-text)]'
              : 'w-fit min-w-0 bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)] ring-1 ring-[var(--app-border)]'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{userText}</p>
          ) : (
            (message.parts || []).map((part, i) => {
              if (part.type === 'text') {
                const text = cleanAssistantText(part.text);
                if (!text) return null;
                if (text === '__API_KEY_MISSING__') {
                  return <APIKeyMissingCard key={i} />;
                }
                // Always render markdown (even during streaming) for better UX
                // ReactMarkdown is optimized enough to handle incremental updates
                return (
                  <div key={i} className="ai-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[
                        rehypeRaw,
                        [rehypeSanitize, htmlVisualSanitizeSchema],
                      ]}
                      components={markdownComponents}
                    >
                      {text}
                    </ReactMarkdown>
                  </div>
                );
              }
              if (part.type === 'reasoning') {
                // Streaming = this reasoning part is the last part (answer text
                // hasn't started yet) — show the live pulse and keep it open.
                const isLive =
                  !!isStreaming && i === (message.parts || []).length - 1;
                return (
                  <ReasoningBlock
                    key={i}
                    text={part.text}
                    live={isLive}
                    startedAt={part.startedAt}
                    endedAt={part.endedAt}
                  />
                );
              }
              if (isToolPart(part)) {
                return <ToolBlock key={i} part={part} />;
              }
              return null;
            })
          )}
        </div>
        {/* Hover actions — below the bubble */}
        {actionButtons && (
          <div
            className={`flex items-center gap-1 px-1 opacity-0 transition-opacity group-hover/msg:opacity-100 ${isUser ? 'justify-end' : ''}`}
          >
            {isUser && onEditResend && (
              <MsgAction
                icon={Pencil}
                label={t('editResend')}
                onClick={() => onEditResend(message.id, userText)}
                dark={false}
              />
            )}
            {isUser && onRollback && (
              <MsgAction
                icon={Scissors}
                label="回退到此前"
                onClick={() => onRollback(message.id)}
                dark={false}
              />
            )}
            {!isUser && onRegenerate && (
              <MsgAction
                icon={RotateCcw}
                label="重新生成"
                onClick={() => onRegenerate(message.id)}
                dark={false}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MsgAction({
  icon: Icon,
  label,
  onClick,
  dark,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  dark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] transition-colors ${
        dark
          ? 'text-[var(--app-bg)]/60 hover:bg-[var(--app-bg)]/15 hover:text-[var(--app-bg)]'
          : 'text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
      }`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </button>
  );
}

/** Collapsible chain-of-thought block for reasoning models (R1/QwQ/thinking). */
function ReasoningBlock({
  text,
  live,
  startedAt,
  endedAt,
}: {
  text: string;
  live: boolean;
  startedAt?: number;
  endedAt?: number;
}) {
  const t = useTranslations('ai');
  const [manuallyToggled, setManuallyToggled] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Tick once per second while thinking so the elapsed label counts up.
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  // Auto-open while thinking streams, auto-collapse when the answer starts —
  // unless the user has toggled it themselves.
  const effectiveOpen = manuallyToggled ? open : live;
  if (!text.trim()) return null;
  const elapsedSec = startedAt
    ? Math.max(
        1,
        Math.round(((live ? now : (endedAt ?? now)) - startedAt) / 1000),
      )
    : null;
  return (
    <div className="mb-2.5 -mx-0.5">
      <button
        type="button"
        onClick={() => {
          setManuallyToggled(true);
          setOpen(!effectiveOpen);
        }}
        className="group/think flex w-full cursor-pointer items-center gap-2 rounded-full py-0.5 text-[11.5px] text-[var(--app-text-muted)] transition-colors hover:text-[var(--app-text)]"
      >
        <span
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
            live
              ? 'bg-[var(--app-accent-soft)]/40'
              : 'bg-[var(--app-hover)]/70 group-hover/think:bg-[var(--app-hover)]'
          }`}
        >
          <Brain
            className={`h-3 w-3 ${live ? 'animate-pulse text-[var(--app-accent)]' : 'text-[var(--app-text-muted)]'}`}
          />
        </span>
        <span className="font-medium tracking-wide">
          {live ? t('thinkingLive') : t('thinkingDone')}
        </span>
        {elapsedSec && (
          <span
            className={`tabular-nums ${live ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-muted)]/70'}`}
          >
            {elapsedSec}s
          </span>
        )}
        {live && (
          <span className="flex gap-0.5">
            <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--app-accent)]/70 [animation-delay:0ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--app-accent)]/70 [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--app-accent)]/70 [animation-delay:300ms]" />
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-3 w-3 opacity-40 transition-transform group-hover/think:opacity-80 ${effectiveOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {effectiveOpen && (
        <div className="relative mt-1.5 max-h-64 overflow-y-auto rounded-r-lg border-l-2 border-[var(--app-accent-soft)]/70 bg-gradient-to-r from-[var(--app-surface-muted)]/80 to-transparent py-2 pl-3.5 pr-2">
          <p className="whitespace-pre-wrap text-[12px] font-normal leading-[1.8] text-[var(--app-text-muted)]">
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

// Export without memo to ensure external state changes (like proposal acceptance) trigger re-renders
export const AIMessage = AIMessageImpl;
