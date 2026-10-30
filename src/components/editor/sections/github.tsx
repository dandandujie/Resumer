'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, RefreshCw, Star, Code2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SortableList } from '../dnd/sortable-item';
import { ItemCard } from '../fields/item-card';
import { useEditorStore } from '@/stores/editor-store';
import { plainText } from '@/lib/resume-text';
import { EditableText } from '../fields/editable-text';
import { EditableRichText } from '../fields/editable-rich-text';
import { generateId } from '@/lib/utils';
import type { ResumeSection, GitHubContent, GitHubRepoItem } from '@/types/resume';

const GITHUB_REPO_RE = /github\.com\/[^/]+\/[^/]+/;

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<GitHubContent>) => void;
}

export function GitHubSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as GitHubContent;
  const items = content.items || [];
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Keep a ref to always access the latest items, avoiding stale closures in setTimeout
  const itemsRef = useRef(items);
  useLayoutEffect(() => { itemsRef.current = items; }, [items]);

  const addItemAt = (index = items.length) => {
    const newItem: GitHubRepoItem = {
      id: generateId(),
      repoUrl: '',
      name: '',
      stars: 0,
      language: '',
      description: '',
    };
    onUpdate({ items: [...items.slice(0,index), newItem, ...items.slice(index)] } as any);
    useEditorStore.getState().setActiveItem({sectionId:section.id,itemId:newItem.id});
  };

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items]; const [item] = next.splice(from,1); next.splice(to,0,item);
    onUpdate({items:next} as any);
  };

  const updateItem = (index: number, data: Partial<GitHubRepoItem>) => {
    const latest = itemsRef.current;
    const updated = latest.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    const item = items[index];
    const timer = debounceTimers.current.get(item.id);
    if (timer) clearTimeout(timer);
    debounceTimers.current.delete(item.id);
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  const fetchRepo = async (itemId: string, url: string) => {
    const latest = itemsRef.current;
    const item = latest.find(entry => entry.id === itemId && plainText(entry.repoUrl) === plainText(url));
    if (!item) return;
    setLoadingIds((prev) => new Set(prev).add(item.id));
    try {
      const data = await (await import('@/lib/tauri-api')).aiFetchGithubRepo(plainText(url));
      if (data) {
        const latestIndex = itemsRef.current.findIndex(entry => entry.id === item.id && plainText(entry.repoUrl) === plainText(url));
        if (latestIndex < 0) return;
        const current = itemsRef.current[latestIndex];
        updateItem(latestIndex, {
          name: current.name || data.name,
          stars: data.stars,
          language: data.language,
          description: current.description || data.description,
        });
      }
    } catch { /* ignore */ }
    finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleUrlChange = (index: number, value: string) => {
    const item = items[index];
    updateItem(index, { repoUrl: value });

    const prev = debounceTimers.current.get(item.id);
    if (prev) clearTimeout(prev);

    if (plainText(value) !== plainText(item.repoUrl) && GITHUB_REPO_RE.test(plainText(value))) {
      const timer = setTimeout(() => {
        debounceTimers.current.delete(item.id);
        fetchRepo(item.id, value);
      }, 600);
      debounceTimers.current.set(item.id, timer);
    }
  };

  // Auto-refresh stars for all repos on mount
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    didAutoRefresh.current = true;
    const current = itemsRef.current;
    current.forEach((item) => {
      if (item.repoUrl && GITHUB_REPO_RE.test(plainText(item.repoUrl))) {
        import('@/lib/tauri-api')
          .then((api) => api.aiFetchGithubRepo(plainText(item.repoUrl)))
          .then((data) => { const latest = itemsRef.current.findIndex(entry => entry.id === item.id && plainText(entry.repoUrl) === plainText(item.repoUrl)); if (data && latest >= 0) updateItem(latest, { stars: data.stars }); })
          .catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    for (const timer of debounceTimers.current.values()) clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      <SortableList items={items.map(item=>item.id)} onMove={moveItem} ownHandle>
        {(_, index, handle) => { const item=items[index]; return (
          <ItemCard sectionId={section.id} itemId={item.id} index={index} count={items.length} title={plainText(item.name || item.repoUrl)} handle={handle}
            onMove={(to)=>moveItem(index,to)} onInsert={()=>addItemAt(index)} onRemove={()=>removeItem(index)}>
            <EditableText field="name" label={t('projectName')} value={item.name} onChange={value=>updateItem(index,{name:value})} />
            <div className="relative">
              <EditableText field="repoUrl"
                label={t('repoUrl')}
                value={item.repoUrl}
                onChange={(v) => handleUrlChange(index, v)}
              />
              {loadingIds.has(item.id) && (
                <Loader2 className="absolute right-2 top-7 h-4 w-4 animate-spin text-[var(--app-text-muted)]" />
              )}
            </div>
            {item.name && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)]">
                <span className="font-medium text-[var(--app-text)]">{plainText(item.name)}</span>
                {item.stars > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3 w-3 text-amber-500" />
                    {item.stars.toLocaleString()}
                  </span>
                )}
                {item.language && (
                  <span className="inline-flex items-center gap-0.5">
                    <Code2 className="h-3 w-3" />
                    {item.language}
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-0.5 text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                  onClick={() => fetchRepo(item.id, item.repoUrl)}
                  disabled={loadingIds.has(item.id)}
                >
                  <RefreshCw className={`h-3 w-3 ${loadingIds.has(item.id) ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
            <EditableRichText field="description" label={t('description')} value={item.description} onChange={(v) => updateItem(index, { description: v })} />
          </ItemCard>
        ); }}
      </SortableList>
      <Button variant="outline" size="sm" onClick={() => addItemAt()} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
