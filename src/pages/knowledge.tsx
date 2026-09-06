import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, FilePlus, RefreshCw, Save, Search } from 'lucide-react';
import { useKnowledgeStore } from '@/stores/knowledge-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function KnowledgePage() {
  const { pages, selectedPath, selectedContent, loading, load, select, write, ingest, setSelectedContent } = useKnowledgeStore();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => pages.filter((page) => `${page.title} ${page.path} ${page.summary}`.toLowerCase().includes(query.toLowerCase())),
    [pages, query],
  );
  const selected = pages.find((page) => page.path === selectedPath);

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      await write(selectedPath, selectedContent);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await ingest(Array.from(new Uint8Array(await file.arrayBuffer())), file.name);
    event.target.value = '';
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--whale-cream)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--whale-divider)] px-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h1 className="text-lg font-semibold">知识库</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />重新索引
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md bg-brand px-3 py-2 text-sm text-white hover:bg-brand-hover">
            <FilePlus className="mr-1.5 h-3.5 w-3.5" />上传资料
            <input type="file" className="hidden" onChange={(event) => void handleUpload(event)} />
          </label>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_240px]">
        <aside className="min-h-0 overflow-y-auto border-r border-[var(--whale-divider)] p-3">
          <div className="relative mb-3">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面" className="pl-8" />
          </div>
          <div className="space-y-1">
            {filtered.map((page) => (
              <button
                key={page.path}
                type="button"
                onClick={() => void select(page.path)}
                className={`w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm ${selectedPath === page.path ? 'bg-brand/10 text-brand' : 'hover:bg-muted'}`}
              >
                <div className="truncate font-medium">{page.title || page.path}</div>
                <div className="truncate text-[11px] text-muted-foreground">{page.path}</div>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-h-0 overflow-y-auto p-6">
          {selectedPath ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{selectedPath}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing((value) => !value)}>
                    {editing ? '阅读' : '编辑'}
                  </Button>
                  {editing && (
                    <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />保存
                    </Button>
                  )}
                </div>
              </div>
              {editing ? (
                <Textarea
                  value={selectedContent}
                  onChange={(event) => setSelectedContent(event.target.value)}
                  className="min-h-[60vh] font-mono text-sm"
                />
              ) : (
                <article className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{selectedContent}</ReactMarkdown>
                </article>
              )}
            </>
          ) : (
            <div className="py-20 text-center text-sm text-muted-foreground">选择一个知识页面</div>
          )}
        </main>
        <aside className="min-h-0 overflow-y-auto border-l border-[var(--whale-divider)] p-4 text-sm">
          <h2 className="mb-3 font-semibold">页面信息</h2>
          {selected ? (
            <dl className="space-y-3">
              <div><dt className="text-xs text-muted-foreground">类型</dt><dd>{selected.type}</dd></div>
              <div><dt className="text-xs text-muted-foreground">标签</dt><dd>{selected.tags.join('、') || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">摘要</dt><dd className="leading-relaxed">{selected.summary || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">更新时间</dt><dd>{selected.updated || '—'}</dd></div>
            </dl>
          ) : <p className="text-muted-foreground">暂无页面</p>}
        </aside>
      </div>
    </div>
  );
}
