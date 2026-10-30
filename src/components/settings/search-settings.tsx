'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { aiTestSearch, getAIConfig } from '@/lib/tauri-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore, type WebSearchMode } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

interface SearchField {
  label: string;
  value: string;
  update: (value: string) => void;
  placeholder: string;
  secret?: boolean;
}

export function SearchSettings() {
  const t = useTranslations('settings.webSearch');
  const s = useSettingsStore();
  const [testing, setTesting] = useState<WebSearchMode | null>(null);
  const [testResult, setTestResult] = useState<{ id: WebSearchMode; message: string; ok: boolean } | null>(null);
  const revision = useRef(0);
  const clearTest = () => { revision.current++; setTestResult(null); };
  const testSearch = async (id: WebSearchMode) => {
    const current = ++revision.current;
    setTesting(id);
    setTestResult(null);
    try {
      const result = await aiTestSearch({ ...getAIConfig(), webSearchMode: id });
      if (current === revision.current) setTestResult({ id, ok: true, message: t('testSuccess', { count: result.results.length }) });
    } catch (error) {
      if (current === revision.current) setTestResult({ id, ok: false, message: String((error as Error)?.message || error) });
    } finally { setTesting(null); }
  };
  const radio = (id: WebSearchMode, title: string) => (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-medium">
      <input type="radio" name="web-search-service" value={id} checked={s.webSearchMode === id} onChange={() => { clearTest(); s.setWebSearchMode(id); }} className="shrink-0 accent-[var(--app-text)]" />
      {title}
      {s.webSearchMode === id && <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{t('active')}</span>}
    </label>
  );
  const basic: { id: WebSearchMode; title: string }[] = [
    { id: 'off', title: t('off') }, { id: 'native', title: t('native') },
    { id: 'free', title: 'DuckDuckGo' }, { id: 'bing', title: 'Bing' },
    { id: 'google', title: 'Google' }, { id: 'baidu', title: t('baidu') },
  ];
  const keyField = (value: string, update: (value: string) => void, placeholder: string): SearchField => ({ label: 'API Key', value, update, placeholder, secret: true });
  const urlField = (value: string, update: (value: string) => void, placeholder: string): SearchField => ({ label: t('baseUrl'), value, update, placeholder });
  const modelField = (value: string, update: (value: string) => void, placeholder: string): SearchField => ({ label: t('model'), value, update, placeholder });
  const services: { id: WebSearchMode; title: string; hint: string; ready: boolean; fields: SearchField[] }[] = [
    { id: 'tavily', title: 'Tavily', hint: t('tavilyHint'), ready: !!s.tavilyApiKey.trim(), fields: [keyField(s.tavilyApiKey, s.setTavilyApiKey, 'tvly-...')] },
    { id: 'grok', title: 'Grok · xAI', hint: t('grokHint'), ready: !!s.grokApiKey.trim(), fields: [urlField(s.grokBaseURL, s.setGrokBaseURL, 'https://api.x.ai/v1'), modelField(s.grokModel, s.setGrokModel, 'grok-4.7'), keyField(s.grokApiKey, s.setGrokApiKey, 'xai-...')] },
    { id: 'doubao', title: t('doubao'), hint: t('doubaoHint'), ready: !!s.doubaoApiKey.trim() && !!s.doubaoModel.trim(), fields: [urlField(s.doubaoBaseURL, s.setDoubaoBaseURL, 'https://ark.cn-beijing.volces.com/api/v3'), modelField(s.doubaoModel, s.setDoubaoModel, t('doubaoModelPlaceholder')), keyField(s.doubaoApiKey, s.setDoubaoApiKey, 'ARK API Key')] },
    { id: 'deepseek', title: t('deepseekNative'), hint: t('deepseekHint'), ready: !!s.deepseekApiKey.trim(), fields: [urlField(s.deepseekBaseURL, s.setDeepseekBaseURL, 'https://api.deepseek.com/anthropic/v1'), modelField(s.deepseekModel, s.setDeepseekModel, 'deepseek-v4-flash'), keyField(s.deepseekApiKey, s.setDeepseekApiKey, 'sk-...')] },
    { id: 'deepseek-api', title: t('deepseekDirect'), hint: t('deepseekApiHint'), ready: !!s.deepseekApiKey.trim(), fields: [urlField(s.deepseekSearchURL, s.setDeepseekSearchURL, 'https://api.deepseek.com/v1/tools'), keyField(s.deepseekApiKey, s.setDeepseekApiKey, 'sk-...')] },
  ];
  return (
    <section className="space-y-4" aria-label={t('title')}>
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4" />{t('title')}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('description')}</p></div>
      <div className="rounded-xl border bg-background p-4">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {basic.map(({ id, title }) => <div key={id} data-search-service={id}>{radio(id, title)}</div>)}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{t('basicHint')}</p>
        {!['off', 'native'].includes(s.webSearchMode) && basic.some(({id}) => id === s.webSearchMode) && <Button type="button" variant="outline" size="sm" className="mt-3" disabled={!!testing} onClick={() => void testSearch(s.webSearchMode)}>{testing ? t('testing') : t('test')}</Button>}
        {testResult && basic.some(({id}) => id === testResult.id) && <p role="status" className={cn('mt-2 break-words text-xs', testResult.ok ? 'text-[var(--app-text-secondary)]' : 'text-destructive')}>{testResult.message}</p>}
      </div>
      <div className="space-y-3">
        {services.map(({ id, title, hint, ready, fields }) => (
          <section key={id} data-search-service={id} className={cn('min-w-0 rounded-xl border p-4', s.webSearchMode === id ? 'border-brand bg-brand/5' : 'border-border bg-background')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {radio(id, title)}
              <Button type="button" size="sm" variant="outline" aria-label={t('testService', { name: title })} disabled={!!testing || !ready} onClick={() => void testSearch(id)}>{testing === id ? t('testing') : t('test')}</Button>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
            <div className={cn('mt-3 grid gap-3', fields.length === 3 ? 'sm:grid-cols-3' : fields.length === 2 ? 'sm:grid-cols-2' : '')}>
              {fields.map((field) => <label key={field.label} className="block min-w-0 space-y-1.5 text-xs text-muted-foreground"><span>{field.label}</span><Input type={field.secret ? 'password' : 'text'} value={field.value} onChange={(event) => { clearTest(); field.update(event.target.value); }} placeholder={field.placeholder} autoComplete="off" /></label>)}
            </div>
            {testResult?.id === id && <p role="status" className={cn('mt-2 break-words text-xs leading-5', testResult.ok ? 'text-[var(--app-text-secondary)]' : 'text-destructive')}>{testResult.message}</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
