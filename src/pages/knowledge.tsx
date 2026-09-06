import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import ReactMarkdown from 'react-markdown';
import { BookOpen, FilePlus, RefreshCw, Save, Search } from 'lucide-react';
import { useKnowledgeStore } from '@/stores/knowledge-store';
import { KnowledgeGraph } from '@/components/graph/knowledge-graph';
import { KnowledgeProposalCard } from '@/components/ai/ai-proposal-card';
import { mergeKnowledgeGraph } from '@/lib/knowledge-graph';
import * as api from '@/lib/tauri-api';
import { useJournalStore } from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function KnowledgePage() {
  const {
    pages, selectedPath, selectedContent, pendingEntities, loading, load, select, write, ingest, setSelectedContent,
  } = useKnowledgeStore();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [purpose, setPurpose] = useState({ role: '', city: '', industry: '', constraints: '', other: '' });
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [graph, setGraph] = useState<api.KnowledgeGraphData>({ nodes: [], edges: [] });
  const [lintIssues, setLintIssues] = useState<string[]>([]);
  const router = useRouter();
  const applications = useJournalStore((state) => state.applications);
  const mocks = useJournalStore((state) => state.mocks);
  const proposals = useJournalStore((state) => state.knowledgeProposals.__global__ || []);
  const hydrateJournal = useJournalStore((state) => state.hydrate);
  const { resumes, fetchResumes } = useResume();

  useEffect(() => {
    void load();
    void hydrateJournal();
    void fetchResumes();
    void api.knowledgeGraph().then(setGraph);
  }, [fetchResumes, hydrateJournal, load]);

  const mergedGraph = useMemo(
    () => mergeKnowledgeGraph(graph, applications, mocks, resumes),
    [applications, graph, mocks, resumes],
  );

  const filtered = useMemo(
    () => pages.filter((page) => `${page.title} ${page.path} ${page.summary}`
      .toLowerCase().includes(query.toLowerCase())),
    [pages, query],
  );
  const selected = pages.find((page) => page.path === selectedPath);
  const relatedPages = useMemo(() => {
    if (!selectedPath) return [];
    const ids = new Set(
      graph.edges.flatMap((edge) => edge.source === selectedPath
        ? [edge.target] : edge.target === selectedPath ? [edge.source] : []),
    );
    return graph.nodes.filter((node) => ids.has(node.id));
  }, [graph, selectedPath]);

  useEffect(() => {
    if (selectedPath !== 'purpose.md') return;
    const value = (heading: string) => {
      const match = selectedContent.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`));
      return match?.[1]?.trim() || '';
    };
    setPurpose({
      role: value('目标岗位'), city: value('期望城市'), industry: value('目标行业'),
      constraints: value('硬约束'), other: value('其他'),
    });
  }, [selectedPath, selectedContent]);

  const purposeMarkdown = () => `# 求职目标\\n\\n## 目标岗位\\n${purpose.role}\\n\\n## 期望城市\\n${purpose.city}\\n\\n## 目标行业\\n${purpose.industry}\\n\\n## 硬约束\\n${purpose.constraints}\\n\\n## 其他\\n${purpose.other}\\n`;

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      const content = selectedPath === 'purpose.md' ? purposeMarkdown() : selectedContent;
      await write(selectedPath, content);
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
        <div className="flex items-center gap-1 rounded-lg border border-[var(--whale-divider)] p-0.5">
          {(['list', 'graph'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setView(item)} className={`rounded-md px-2.5 py-1 text-xs ${view === item ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)]' : 'text-muted-foreground'}`}>
              {item === 'list' ? '列表' : '图谱'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />重新索引
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void api.knowledgeLint().then((result) => setLintIssues(result.issues))}
          >
            检查知识库
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md bg-brand px-3 py-2 text-sm text-white hover:bg-brand-hover">
            <FilePlus className="mr-1.5 h-3.5 w-3.5" />上传资料
            <input type="file" className="hidden" onChange={(event) => void handleUpload(event)} />
          </label>
        </div>
      </div>
      {lintIssues.length > 0 && (
        <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          {lintIssues.map((issue) => <div key={issue}>{issue}</div>)}
        </div>
      )}
      {proposals.length > 0 && (
        <div className="mx-4 mt-3 space-y-2">
          {proposals.map((proposal, index) => (
            <KnowledgeProposalCard key={`${proposal.path}-${index}`} {...proposal} />
          ))}
        </div>
      )}
      {view === 'graph' ? (
        <div className="min-h-0 flex-1 p-4">
          <KnowledgeGraph
            nodes={mergedGraph.nodes}
            edges={mergedGraph.edges}
            onNodeClick={(node) => {
              if (node.id.startsWith('application:') || node.id.startsWith('interview:')) router.push('/insights');
              else if (node.id.startsWith('wiki/')) void select(node.id);
            }}
          />
        </div>
      ) : <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_240px]">
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
              {editing && selectedPath === 'purpose.md' ? (
                <div className="space-y-4">
                  {([
                    ['role', '目标岗位'], ['city', '期望城市'], ['industry', '目标行业'],
                    ['constraints', '硬约束'], ['other', '其他'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="block text-sm font-medium">
                      {label}
                      <Textarea value={purpose[key]} onChange={(event) => setPurpose({ ...purpose, [key]: event.target.value })} className="mt-1" />
                    </label>
                  ))}
                  <Button onClick={() => setSelectedContent(purposeMarkdown())}>生成 Markdown</Button>
                </div>
              ) : editing ? (
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
          {pendingEntities.length > 0 && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-2">
              <h3 className="mb-2 font-medium">待采纳实体</h3>
              {pendingEntities.map((entity) => <div key={`${entity.type}-${entity.title}`} className="mb-2 text-xs"><b>{entity.title}</b><div>{entity.content}</div></div>)}
            </div>
          )}
          {selected ? (
            <dl className="space-y-3">
              <div><dt className="text-xs text-muted-foreground">类型</dt><dd>{selected.type}</dd></div>
              <div><dt className="text-xs text-muted-foreground">标签</dt><dd>{selected.tags.join('、') || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">摘要</dt><dd className="leading-relaxed">{selected.summary || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">更新时间</dt><dd>{selected.updated || '—'}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">来源</dt>
                <dd>{selected.sources?.join('、') || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">相关页（一跳）</dt>
                <dd className="space-y-1">
                  {relatedPages.length ? relatedPages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      className="block text-left text-brand underline"
                      onClick={() => void select(page.id)}
                    >
                      {page.title}
                    </button>
                  )) : '—'}
                </dd>
              </div>
            </dl>
          ) : <p className="text-muted-foreground">暂无页面</p>}
        </aside>
      </div>}
    </div>
  );
}
