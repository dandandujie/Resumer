'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertOctagon, ChevronDown, ChevronUp, ClipboardCopy, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { classifyAiError, formatDiagnostics, hostOf } from '@/lib/ai-error';
import { getAIConfig } from '@/lib/tauri-api';
import pkg from '../../../package.json';
import { useErrorLogStore, type ErrorLogEntry } from '@/stores/error-log-store';
import { cn } from '@/lib/utils';

function formatTime(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 诊断信息：版本、平台、当前渠道（只带主机名，不带 Key）与原始错误，一键复制给开发者或服务商。 */
function diagnosticsFor(entry: ErrorLogEntry): string {
  const config = getAIConfig();
  return formatDiagnostics({
    time: new Date(entry.time).toISOString(),
    appVersion: pkg.version,
    platform: navigator.platform || navigator.userAgent,
    provider: config.provider,
    baseUrlHost: hostOf(config.baseUrl),
    model: config.model,
    webSearchMode: config.webSearchMode || 'off',
    error: [entry.title, entry.detail].filter(Boolean).join(': '),
  });
}

/** Bottom-left dismissible error log — replaces stuck toasts. Renders nothing when empty. */
export function ErrorLog() {
  const errors = useErrorLogStore((s) => s.errors);
  const dismiss = useErrorLogStore((s) => s.dismiss);
  const clear = useErrorLogStore((s) => s.clear);
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('common');
  const tHint = useTranslations('errors.hint');

  const copyDiagnostics = async (entry: ErrorLogEntry) => {
    await navigator.clipboard.writeText(diagnosticsFor(entry));
    toast.success(t('diagnosticsCopied'));
  };

  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-3 left-3 z-[100] w-80 max-w-[calc(100vw-1.5rem)]">
      <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_10px_40px_-12px_rgba(28,26,23,0.4)]">
        <div className="flex items-center gap-2 border-b border-[var(--app-border)] px-3 py-2">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <span className="text-[12px] font-semibold text-[var(--app-text)]">
            {t('errorLogTitle')} · {errors.length}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title={collapsed ? t('expand') : t('collapse')}
            >
              {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={clear}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-red-500"
              title={t('clearAll')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="max-h-64 overflow-y-auto">
            {errors.map((e) => (
              <div
                key={e.id}
                className={cn(
                  'group flex gap-2 border-b border-[var(--app-border)] px-3 py-2 last:border-b-0'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium text-[var(--app-text)]">{e.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--app-text-muted)]">
                      {formatTime(e.time)}
                    </span>
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-snug text-[var(--app-text-muted)]">
                      {e.detail}
                    </p>
                  )}
                  {(() => {
                    const kind = classifyAiError(`${e.title} ${e.detail || ''}`);
                    return kind === 'unknown' ? null : (
                      <p className="mt-1 rounded bg-[var(--app-accent-soft)]/25 px-1.5 py-1 text-[11px] leading-snug text-[var(--app-text)]">
                        {tHint(kind)}
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => void copyDiagnostics(e)}
                    className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                  >
                    <ClipboardCopy className="h-3 w-3" />
                    {t('copyDiagnostics')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(e.id)}
                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  aria-label={t('close')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
