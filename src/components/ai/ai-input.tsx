'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { SendHorizonal, ChevronDown, Square, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AIChannel } from '@/stores/settings-store';

interface AIInputProps {
  input: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  models: string[];
  /** Channel selection (replaces the old provider dropdown). */
  channels?: AIChannel[];
  activeChannelId?: string | null;
  /** Active channel is configured but has no shortlist → prompt to set one. */
  needsModelSetup?: boolean;
  onSelectChannel?: (id: string) => void;
  onOpenSettings?: () => void;
  selectedModel?: string;
  effectiveModel?: string;
  onModelChange: (model: string) => void;
  /** Shown instead of send while generating — cooperative cancel. */
  onStop?: () => void;
}

export function AIInput({
  input,
  onChange,
  onSubmit,
  isLoading,
  models,
  channels = [],
  activeChannelId,
  needsModelSetup,
  onSelectChannel,
  onOpenSettings,
  selectedModel,
  effectiveModel,
  onModelChange,
  onStop,
}: AIInputProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const t = useTranslations('ai');
  const zh = useLocale() === 'zh';
  const isConfigured = (c: AIChannel) => !!c.apiKey.trim() && !!c.baseURL.trim();
  const hasConfiguredChannel = channels.some(isConfigured);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const modelValue = effectiveModel || selectedModel || undefined;

  return (
    <form onSubmit={onSubmit} className="p-3">
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] transition-all focus-within:border-[var(--app-text)]/30 focus-within:bg-[var(--app-surface)] focus-within:ring-2 focus-within:ring-[var(--app-text)]/8">
        {/* Textarea */}
        <textarea
          aria-label={zh ? '和 AI 讨论简历' : 'Discuss your resume'}
          value={input}
          onChange={onChange}
          placeholder={t('placeholder')}
          rows={2}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const form = e.currentTarget.closest('form');
              if (form) form.requestSubmit();
            }
          }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
          <div className="min-w-0 flex-1">
            {!hasConfiguredChannel && onOpenSettings ? (
              <Button type="button" size="xs" variant="ghost" onClick={onOpenSettings}><Settings2 />{zh ? '设置 AI' : 'Set up AI'}</Button>
            ) : (
              <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" size="xs" variant="ghost" className="max-w-full" disabled={isLoading} aria-label={zh ? '模型与渠道' : 'Model and channel'} title={[zh ? '模型与渠道' : 'Model and channel', activeChannel?.name, modelValue].filter(Boolean).join(' · ')}>
                    <span className="shrink-0">{zh ? 'AI 设置' : 'AI settings'}</span><span className="truncate text-muted-foreground">{needsModelSetup ? t('needModelSetup') : modelValue || t('model')}</span><ChevronDown className="shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" side="top" className="max-w-[calc(100vw-2rem)] space-y-3" data-ai-model-options>
                  {onSelectChannel && <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{zh ? 'AI 渠道' : 'AI channel'}</p>
                    <Select value={activeChannelId ?? undefined} onValueChange={onSelectChannel}>
                      <SelectTrigger className="w-full" aria-label={zh ? 'AI 渠道' : 'AI channel'}><SelectValue>{activeChannel?.name || t('selectChannel')}</SelectValue></SelectTrigger>
                      <SelectContent>{channels.filter(isConfigured).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>}
                  {!needsModelSetup && <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{t('model')}</p>
                    <Select value={modelValue} onValueChange={value => { onModelChange(value); setOptionsOpen(false); }}>
                      <SelectTrigger className="w-full" aria-label={t('model')}><SelectValue placeholder={t('model')} /></SelectTrigger>
                      <SelectContent>{[...new Set([...models, ...(modelValue ? [modelValue] : [])])].map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>}
                  {onOpenSettings && <Button type="button" size="xs" variant="ghost" onClick={() => { setOptionsOpen(false); onOpenSettings(); }}><Settings2 />{needsModelSetup ? t('needModelSetup') : t('channelSettingsEntry')}</Button>}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Send / Stop button */}
          {isLoading && onStop ? (
            <Button type="button" size="icon-sm" variant="outline" onClick={onStop} aria-label={t('stopGenerate')} title={t('stopGenerate')}><Square className="h-3 w-3 fill-current" /></Button>
          ) : (
            <Button type="submit" size="icon-sm" variant="primary" disabled={isLoading || !input.trim()} aria-label={zh ? '发送' : 'Send'} title={zh ? '发送（Enter）；Shift + Enter 换行' : 'Send (Enter); Shift + Enter for a new line'}><SendHorizonal className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
    </form>
  );
}
