'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Settings,
  Eye,
  EyeOff,
  ChevronsUpDown,
  Check,
  Loader2,
  RefreshCw,
  PlugZap,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  PenLine,
} from 'lucide-react';
import * as tauriApi from '@/lib/tauri-api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore, type AIProvider } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

const AI_PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
];

type ConnectionState = 'idle' | 'success' | 'warning' | 'error';

interface AiModelOption {
  id: string;
  label?: string | null;
}

interface AiConnectionTestResult {
  provider: string;
  currentModel: string;
  currentModelAvailable: boolean;
  modelCount: number;
  models: AiModelOption[];
}

export function SettingsDialog() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { activeModal, closeModal } = useUIStore();
  const {
    aiProvider,
    aiApiKey,
    aiBaseURL,
    aiModel,
    channels,
    activeChannelId,
    selectChannel,
    addChannel,
    updateChannel,
    deleteChannel,
    toggleChannelModel,
    setChannelModels,
  } = useSettingsStore();

  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const patchActive = useCallback(
    (patch: Partial<{ name: string; provider: AIProvider; baseURL: string; apiKey: string; model: string }>) => {
      if (activeChannelId) updateChannel(activeChannelId, patch);
    },
    [activeChannelId, updateChannel]
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const isOpen = activeModal === 'settings';

  // Model combobox state
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [renamingChannelId, setRenamingChannelId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const commitChannelRename = () => {
    if (renamingChannelId) {
      const v = renameDraft.trim();
      if (v) updateChannel(renamingChannelId, { name: v });
    }
    setRenamingChannelId(null);
  };
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const canQueryAI = Boolean(aiApiKey.trim() && aiBaseURL.trim());
  const queriedModelSignatureRef = useRef('');

  const buildAIConfig = useCallback(() => ({
    provider: aiProvider,
    apiKey: aiApiKey.trim(),
    baseUrl: aiBaseURL.trim(),
    model: aiModel.trim(),
  }), [aiProvider, aiApiKey, aiBaseURL, aiModel]);

  const modelQuerySignature = useMemo(() => {
    if (!canQueryAI) return '';
    return [aiProvider, aiBaseURL.trim(), aiApiKey.trim()].join('::');
  }, [aiProvider, aiApiKey, aiBaseURL, canQueryAI]);

  const applyFetchedModels = useCallback((models: AiModelOption[]) => {
    const ids = Array.from(new Set((models || []).map((model) => model.id).filter(Boolean)));
    setFetchedModels(ids);
    setModelsFetched(true);
  }, []);

  const fetchModels = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!canQueryAI) {
      setFetchedModels([]);
      setModelsFetched(false);
      if (!silent) {
        setConnectionState('error');
        setConnectionMessage(t('ai.apiKeyRequired'));
      }
      return [];
    }

    queriedModelSignatureRef.current = modelQuerySignature;
    setModelsFetching(true);
    try {
      const models: AiModelOption[] = await tauriApi.aiListModels(buildAIConfig());
      applyFetchedModels(models);
      if (!silent) {
        setConnectionState('success');
        setConnectionMessage(t('ai.modelsUpdated', { count: models.length }));
      }
      return models;
    } catch (error: any) {
      setFetchedModels([]);
      setModelsFetched(true);
      if (!silent) {
        setConnectionState('error');
        setConnectionMessage(error?.message || t('ai.connectionFailedGeneric'));
      }
      return [];
    } finally {
      setModelsFetching(false);
    }
  }, [applyFetchedModels, buildAIConfig, canQueryAI, modelQuerySignature, t]);

  const fetchModelsRef = useRef(fetchModels);

  useEffect(() => {
    fetchModelsRef.current = fetchModels;
  }, [fetchModels]);

  const handleTestConnection = useCallback(async () => {
    if (!canQueryAI) {
      setConnectionState('error');
      setConnectionMessage(t('ai.apiKeyRequired'));
      return;
    }

    setIsTestingConnection(true);
    try {
      const result: AiConnectionTestResult = await tauriApi.aiTestConnection(buildAIConfig());
      applyFetchedModels(result.models || []);

      if (result.currentModel && !result.currentModelAvailable) {
        setConnectionState('warning');
        setConnectionMessage(t('ai.connectionSuccessModelMissing', { count: result.modelCount }));
      } else {
        setConnectionState('success');
        setConnectionMessage(t('ai.connectionSuccess', { count: result.modelCount }));
      }
    } catch (error: any) {
      setConnectionState('error');
      setConnectionMessage(error?.message || t('ai.connectionFailedGeneric'));
    } finally {
      setIsTestingConnection(false);
    }
  }, [applyFetchedModels, buildAIConfig, canQueryAI, t]);

  useEffect(() => {
    queriedModelSignatureRef.current = '';
    setModelsFetched(false);
    setFetchedModels([]);
    setConnectionState('idle');
    setConnectionMessage('');
  }, [aiProvider, aiApiKey, aiBaseURL]);

  useEffect(() => {
    setConnectionState('idle');
    setConnectionMessage('');
  }, [aiModel]);

  useEffect(() => {
    if (!isOpen) return;
    if (!canQueryAI) return;
    if (queriedModelSignatureRef.current === modelQuerySignature) return;

    const timeout = window.setTimeout(() => {
      void fetchModelsRef.current({ silent: true });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [isOpen, canQueryAI, modelQuerySignature]);

  useEffect(() => {
    if (modelOpen && canQueryAI && !modelsFetched && !modelsFetching) {
      void fetchModelsRef.current({ silent: true });
    }
  }, [modelOpen, canQueryAI, modelsFetched, modelsFetching]);

  // Focus search input when popover opens
  useEffect(() => {
    if (modelOpen) {
      setTimeout(() => modelSearchRef.current?.focus(), 50);
    } else {
      setModelSearch('');
    }
  }, [modelOpen]);

  const availableModels = useMemo(() => {
    const merged = aiModel ? [aiModel, ...fetchedModels] : fetchedModels;
    return Array.from(new Set(merged.filter(Boolean)));
  }, [aiModel, fetchedModels]);

  const filteredModels = availableModels.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const favoriteModels = activeChannel?.models || [];
  const favoriteSet = useMemo(() => new Set(favoriteModels), [favoriteModels]);
  const pickerFilteredModels = availableModels.filter((m) =>
    m.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  useEffect(() => {
    if (!pickerOpen) setPickerSearch('');
  }, [pickerOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-[760px] p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            {t('ai.title')}
          </DialogTitle>
          <DialogDescription>{t('ai.description')}</DialogDescription>
        </DialogHeader>

        {/* 左：渠道列表；右：选中渠道的配置 */}
        <div>
            <div className="flex h-[64vh]">
              {/* Left: channel rail */}
              <div className="flex w-44 shrink-0 flex-col border-r border-border">
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <div className="space-y-0.5">
                    {channels.map((ch) => {
                      const active = ch.id === activeChannelId;
                      const renaming = ch.id === renamingChannelId;
                      return (
                        <div
                          key={ch.id}
                          onClick={() => !renaming && selectChannel(ch.id)}
                          onDoubleClick={() => {
                            setRenameDraft(ch.name);
                            setRenamingChannelId(ch.id);
                          }}
                          title={t('ai.channelRenameHint')}
                          className={cn(
                            'group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                            active ? 'bg-brand/10 font-medium text-brand' : 'text-foreground hover:bg-muted'
                          )}
                        >
                          {renaming ? (
                            <input
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={commitChannelRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitChannelRename();
                                else if (e.key === 'Escape') setRenamingChannelId(null);
                              }}
                              className="min-w-0 flex-1 rounded border border-brand/40 bg-background px-1 py-0.5 text-[13px] outline-none"
                            />
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenameDraft(ch.name);
                                  setRenamingChannelId(ch.id);
                                }}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                                aria-label={t('ai.channelRename')}
                              >
                                <PenLine className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteChannel(ch.id);
                                }}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                                aria-label={t('ai.channelDelete')}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-border p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full cursor-pointer"
                    onClick={() => addChannel('')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t('ai.channelAdd')}</span>
                  </Button>
                </div>
              </div>

              {/* Right: config for the active channel */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {!activeChannel ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                    {t('ai.channelNone')}
                  </div>
                ) : (
                  <>
                    {/* Channel name */}
                    <div className="space-y-1.5">
                      <Label>{t('ai.channelName')}</Label>
                      <Input
                        value={activeChannel.name}
                        onChange={(e) => patchActive({ name: e.target.value })}
                        placeholder={t('ai.channelNamePlaceholder')}
                      />
                    </div>

                    {/* API 地址 */}
                    <div className="space-y-2">
                      <Label>{t('ai.baseURL')}</Label>
                      <Input
                        value={activeChannel.baseURL}
                        onChange={(e) => patchActive({ baseURL: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>

                    {/* API Key */}
                    <div className="space-y-2">
                      <Label>{t('ai.apiKey')}</Label>
                      <div className="relative">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          value={activeChannel.apiKey}
                          onChange={(e) => patchActive({ apiKey: e.target.value })}
                          placeholder={t('ai.apiKeyPlaceholder')}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{t('ai.apiKeyHint')}</p>
                    </div>

                    {/* 模型协议 */}
                    <div className="space-y-2">
                      <Label>{t('ai.protocol')}</Label>
                      <Select value={activeChannel.provider} onValueChange={(v) => patchActive({ provider: v as AIProvider })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t('ai.protocolHint')}</p>
                    </div>

                    {/* 默认模型 — Combobox */}
                    <div className="space-y-2">
                      <Label>{t('ai.defaultModel')}</Label>
              <Popover open={modelOpen} onOpenChange={setModelOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelOpen}
                    className="w-full justify-between cursor-pointer font-normal"
                  >
                    <span className="truncate">{aiModel || t('ai.modelPlaceholder')}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  {/* Search input */}
                  <div className="border-b px-3 py-2">
                    <Input
                      ref={modelSearchRef}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder={tCommon('search')}
                      className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                  </div>

                  {/* Model list */}
                  <div className="max-h-48 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
                    {modelsFetching && (
                      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {tCommon('loading')}
                      </div>
                    )}

                    {!modelsFetching && filteredModels.length === 0 && modelsFetched && (
                      <div className="py-3 text-center text-xs text-muted-foreground">
                        {t('ai.noModelsFound')}
                      </div>
                    )}

                    {filteredModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={cn(
                          'flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted',
                          aiModel === m && 'bg-muted'
                        )}
                        onClick={() => {
                          patchActive({ model: m });
                          setModelOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', aiModel === m ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{m}</span>
                      </button>
                    ))}
                  </div>

                  {/* Manual entry */}
                  <div className="border-t px-3 py-2">
                    <Input
                      value={aiModel}
                      onChange={(e) => patchActive({ model: e.target.value })}
                      placeholder={t('ai.modelPlaceholder')}
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setModelOpen(false);
                      }}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Curated model shortlist — what the chat model pickers show */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('ai.modelListTitle')}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setPickerOpen(true)}
                  disabled={availableModels.length === 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('ai.modelListEdit')}</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('ai.modelListHint')}</p>
              {favoriteModels.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  {availableModels.length === 0 ? t('ai.modelListEmpty') : t('ai.modelListNone')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {favoriteModels.map((m) => (
                    <span
                      key={m}
                      className="flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 py-1 pl-3 pr-1.5 text-xs"
                    >
                      <span className="truncate">{m}</span>
                      <button
                        type="button"
                        onClick={() => activeChannelId && toggleChannelModel(activeChannelId, m)}
                        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={t('ai.modelListRemove')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Model picker — searchable multi-select in its own modal */}
            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
              <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
                <DialogHeader className="px-5 pb-2 pt-5">
                  <DialogTitle>{t('ai.modelPickerTitle')}</DialogTitle>
                  <DialogDescription>{t('ai.modelPickerHint')}</DialogDescription>
                </DialogHeader>
                <div className="border-y px-4 py-2">
                  <Input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder={tCommon('search')}
                    className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="max-h-[50vh] space-y-0.5 overflow-y-auto p-2">
                  {pickerFilteredModels.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {t('ai.noModelsFound')}
                    </p>
                  ) : (
                    pickerFilteredModels.map((m) => {
                      const checked = favoriteSet.has(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => activeChannelId && toggleChannelModel(activeChannelId, m)}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted',
                            checked && 'bg-muted/70'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              checked ? 'border-brand bg-brand text-white' : 'border-border'
                            )}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{m}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <DialogFooter className="flex-row items-center border-t px-5 py-3 sm:justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('ai.modelListSelected', { count: favoriteModels.length })}
                  </span>
                  <div className="flex items-center gap-2">
                    {favoriteModels.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer text-muted-foreground"
                        onClick={() => activeChannelId && setChannelModels(activeChannelId, [])}
                      >
                        {t('ai.modelListClear')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="cursor-pointer bg-brand hover:bg-brand-hover"
                      onClick={() => setPickerOpen(false)}
                    >
                      {t('ai.modelPickerDone')}
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="space-y-3 rounded-lg border border-border bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t('ai.connectionHint')}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchModels()}
                  disabled={!canQueryAI || modelsFetching || isTestingConnection}
                  className="cursor-pointer"
                >
                  {modelsFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>{modelsFetching ? t('ai.fetchingModels') : t('ai.fetchModels')}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleTestConnection()}
                  disabled={!canQueryAI || isTestingConnection || modelsFetching}
                  className="cursor-pointer bg-brand hover:bg-brand-hover"
                >
                  {isTestingConnection ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlugZap className="h-3.5 w-3.5" />
                  )}
                  <span>{isTestingConnection ? t('ai.testingConnection') : t('ai.testConnection')}</span>
                </Button>
              </div>

              {connectionState === 'idle' ? null : (
                <div
                  className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
                    connectionState === 'success' && 'bg-emerald-50 text-emerald-700',
                    connectionState === 'warning' && 'bg-amber-50 text-amber-700',
                    connectionState === 'error' && 'bg-red-50 text-red-700'
                  )}
                >
                  {connectionState === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="leading-relaxed break-all">{connectionMessage}</span>
                </div>
              )}
            </div>
                  </>
                )}
              </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
