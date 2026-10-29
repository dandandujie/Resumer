import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import i18n from '@/i18n';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { BookOpen, FilePlus, Info, List, Loader2, MoreHorizontal, RefreshCw, Save, Search, X } from 'lucide-react';
import { useKnowledgeStore, type PendingEntity } from '@/stores/knowledge-store';
import { KnowledgeGraph } from '@/components/graph/knowledge-graph';
import { KnowledgeProposalCard } from '@/components/ai/ai-proposal-card';
import { mergeKnowledgeGraph } from '@/lib/knowledge-graph';
import {
  PURPOSE_HEADINGS,
  WIKILINK_SCHEME,
  parsePurpose,
  serializePurpose,
  stripFrontmatter,
  wikilinksToMarkdown,
  type PurposeFields,
} from '@/lib/knowledge-page';
import * as api from '@/lib/tauri-api';
import { NO_PROPOSALS, useJournalStore } from '@/stores/journal-store';
import { useResume } from '@/hooks/use-resume';
import { logError } from '@/stores/error-log-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const UPLOAD_ACCEPT = '.md,.markdown,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const ROOT_PAGES = ['purpose.md', 'schema.md', 'index.md'];
/** 左栏分组顺序：根页面 → 目标相关 → 沉淀 → 来源。 */
const TYPE_ORDER = ['root', 'skill', 'sop', 'company', 'role', 'market', 'experience', 'source', 'note'];

function pageKind(page: api.KnowledgePageSummary): string {
  if (ROOT_PAGES.includes(page.path)) return 'root';
  return TYPE_ORDER.includes(page.type) ? page.type : 'note';
}

function errorMessage(error: unknown): string {
  return String((error as Error)?.message || error);
}

export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  const tJournal = useTranslations('journal');
  const {
    pages, selectedPath, selectedContent, pendingEntities, loading,
    load, reindex, select, write, ingest, adoptEntity, dismissEntity,
  } = useKnowledgeStore();
  const [query, setQuery] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // 从仪表盘引导跳过来时直接进入编辑态；标记只消费一次
  const [editing, setEditing] = useState(() => {
    const pending = useKnowledgeStore.getState().pendingOpen;
    return pending?.edit ?? false;
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 草稿按页面保存，切换目录或阅读模式不会把未保存内容混进别的页面。
  const drafts = useKnowledgeStore((state) => state.drafts);
  const setDraft = useKnowledgeStore((state) => state.setDraft);
  const clearSavedDraft = useKnowledgeStore((state) => state.clearSavedDraft);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [graph, setGraph] = useState<api.KnowledgeGraphData>({ nodes: [], edges: [] });
  const [lintIssues, setLintIssues] = useState<string[] | null>(null);
  const router = useRouter();
  const applications = useJournalStore((state) => state.applications);
  const mocks = useJournalStore((state) => state.mocks);
  const proposals = useJournalStore((state) => state.knowledgeProposals.__global__ ?? NO_PROPOSALS);
  const resolveKnowledgeProposal = useJournalStore((state) => state.resolveKnowledgeProposal);
  const hydrateJournal = useJournalStore((state) => state.hydrate);
  const { resumes, fetchResumes } = useResume();

  const refreshGraph = useCallback(
    () => api.knowledgeGraph().then(setGraph).catch((error) => logError(i18n.t('knowledge.title'), errorMessage(error))),
    [],
  );

  useEffect(() => {
    load()
      .catch((error) => logError(i18n.t('knowledge.title'), errorMessage(error)))
      .finally(() => useKnowledgeStore.setState({ pendingOpen: null }));
    void hydrateJournal();
    void fetchResumes();
    void refreshGraph();
  }, [fetchResumes, hydrateJournal, load, refreshGraph]);

  /** 所有切页入口都走这里：切页即退出编辑态，避免把 A 页的草稿存到 B 页。 */
  const openPage = useCallback(
    (path: string) => {
      setEditing(false);
      setShowLibrary(false);
      return select(path).catch((error) => logError(t('title'), errorMessage(error)));
    },
    [select, t],
  );

  const mergedGraph = useMemo(
    () => mergeKnowledgeGraph(graph, applications, mocks, resumes, {
      application: tJournal('graphUntitledApplication'),
      interview: tJournal('graphInterview'),
      mockInterview: tJournal('graphMockInterview'),
    }),
    [applications, graph, mocks, resumes, tJournal],
  );

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = pages.filter((page) =>
      !needle || `${page.title} ${page.path} ${page.summary} ${page.tags.join(' ')}`.toLowerCase().includes(needle),
    );
    const groups = new Map<string, api.KnowledgePageSummary[]>();
    for (const page of filtered) {
      const kind = pageKind(page);
      groups.set(kind, [...(groups.get(kind) || []), page]);
    }
    return TYPE_ORDER.filter((kind) => groups.has(kind)).map((kind) => ({ kind, pages: groups.get(kind)! }));
  }, [pages, query]);

  const selected = pages.find((page) => page.path === selectedPath);
  const isPurpose = selectedPath === 'purpose.md';
  const relatedPages = useMemo(() => {
    if (!selectedPath) return [];
    const ids = new Set(
      graph.edges.flatMap((edge) =>
        edge.source === selectedPath ? [edge.target] : edge.target === selectedPath ? [edge.source] : []),
    );
    return graph.nodes.filter((node) => ids.has(node.id));
  }, [graph, selectedPath]);

  const currentDraft = selectedPath ? drafts[selectedPath] : undefined;
  const draftContent = typeof currentDraft === 'object' ? serializePurpose(currentDraft) : currentDraft ?? selectedContent;
  // 表单编辑期间保留原始空白；每次按键都序列化再解析会吞掉空格和换行。
  const purpose = typeof currentDraft === 'object' ? currentDraft : parsePurpose(draftContent);
  const changeDraft = (content: string | PurposeFields) => {
    if (selectedPath) setDraft(selectedPath, content);
  };
  const toggleEditing = () => setEditing((value) => !value);

  const readerMarkdown = useMemo(() => {
    let body = stripFrontmatter(selectedContent);
    const heading = body.match(/^\s*# ([^\n]+)\n/);
    // 页面标题已在阅读栏固定显示，正文不重复输出同一标题。
    if (heading && heading[1].trim() === selected?.title) body = body.slice(heading[0].length);
    return wikilinksToMarkdown(body);
  }, [selectedContent, selected?.title]);

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      await write(selectedPath, isPurpose ? serializePurpose(purpose) : draftContent);
      clearSavedDraft(selectedPath, currentDraft);
      const latest = useKnowledgeStore.getState();
      if (latest.selectedPath === selectedPath && latest.drafts[selectedPath] === undefined) setEditing(false);
      toast.success(t('saved'));
    } catch (error) {
      logError(t('saveFailed'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await ingest(Array.from(new Uint8Array(await file.arrayBuffer())), file.name);
      toast.success(t('uploadDone', { title: result.source.title }));
      await openPage(result.source.path);
      void refreshGraph();
    } catch (error) {
      logError(t('uploadFailed'), errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const handleReindex = async () => {
    try {
      const count = await reindex();
      toast.success(t('reindexDone', { count }));
      void refreshGraph();
    } catch (error) {
      logError(t('reindex'), errorMessage(error));
    }
  };

  const handleLint = async () => {
    try {
      const result = await api.knowledgeLint();
      setLintIssues(result.issues);
      if (result.issues.length === 0) toast.success(t('lintClean'));
    } catch (error) {
      logError(t('lint'), errorMessage(error));
    }
  };

  const handleAdopt = async (entity: PendingEntity) => {
    try {
      const path = await adoptEntity(entity);
      setEditing(false);
      toast.success(t('adopted', { path }));
      void refreshGraph();
    } catch (error) {
      logError(t('adoptFailed'), errorMessage(error));
    }
  };

  const openWikilink = (href: string) => {
    const path = decodeURI(href.slice(WIKILINK_SCHEME.length));
    if (pages.some((page) => page.path === path)) {
      void openPage(path);
      setView('list');
    } else {
      toast.error(t('linkMissing', { path }));
    }
  };

  const typeLabel = (kind: string) => t(`type${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);

  const pageDetails = selected ? (
              <dl className="space-y-3">
                <div><dt className="text-xs text-muted-foreground">{t('type')}</dt><dd>{typeLabel(pageKind(selected))}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t('tags')}</dt><dd>{selected.tags.join('、') || t('none')}</dd></div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('summary')}</dt>
                  <dd className="leading-relaxed">{selected.summary || t('none')}</dd>
                </div>
                <div><dt className="text-xs text-muted-foreground">{t('updated')}</dt><dd>{selected.updated || t('none')}</dd></div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('sources')}</dt>
                  <dd className="break-all">{selected.sources?.join('、') || t('none')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t('related')}</dt>
                  <dd className="space-y-1">
                    {relatedPages.length ? relatedPages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        className="block cursor-pointer text-left text-brand underline"
                        onClick={() => void openPage(page.id)}
                      >
                        {page.title}
                      </button>
                    )) : t('none')}
                  </dd>
                </div>
              </dl>
            ) : <p className="text-muted-foreground">{t('selectPage')}</p>;

  return (
    <div className="knowledge-workspace flex h-full min-h-0 min-w-0 flex-col bg-[var(--whale-cream)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[var(--whale-divider)] px-4 py-5 lg:px-7">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium tracking-wider text-[var(--whale-ink-muted)]">
            <BookOpen className="h-3.5 w-3.5" />{t('libraryCount', { count: pages.length })}
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-xs leading-relaxed text-[var(--whale-ink-muted)]">{t('workspaceHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-[var(--whale-cream-deep)] p-1" role="tablist" aria-label={t('viewLabel')}>
            {(['list', 'graph'] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}
                className={cn('cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors', view === item ? 'bg-[var(--whale-card)] text-[var(--whale-ink)] shadow-sm' : 'text-[var(--whale-ink-muted)]')}>
                {item === 'list' ? t('viewList') : t('viewGraph')}
              </button>
            ))}
          </div>
          <label className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--whale-ink)] px-3 py-2 text-xs font-medium text-[var(--whale-cream)] focus-within:ring-2 focus-within:ring-[var(--whale-mint-deep)]', uploading && 'pointer-events-none opacity-60')}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus className="h-3.5 w-3.5" />}
            {uploading ? t('uploading') : t('upload')}
            <input type="file" accept={UPLOAD_ACCEPT} disabled={uploading} className="sr-only" onChange={(event) => void handleUpload(event)} />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('maintenance')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={loading} onSelect={() => void handleReindex()}><RefreshCw className="h-3.5 w-3.5" />{t('reindex')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleLint()}>{t('lint')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {lintIssues && lintIssues.length > 0 && (
        <div className="mx-4 mt-3 max-h-48 shrink-0 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between font-medium">
            <span>{t('lintIssues', { count: lintIssues.length })}</span>
            <button type="button" onClick={() => setLintIssues(null)} aria-label={t('dismiss')} className="cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {lintIssues.map((issue) => <div key={issue}>{issue}</div>)}
        </div>
      )}
      {proposals.length > 0 && (
        <div className="mx-4 mt-3 max-h-48 shrink-0 space-y-2 overflow-y-auto">
          {proposals.map((proposal) => (
            <KnowledgeProposalCard
              key={proposal.id}
              {...proposal}
              onResolved={(status) => {
                resolveKnowledgeProposal(proposal.id);
                if (status === 'accepted') void load().then(() => openPage(proposal.path));
              }}
            />
          ))}
        </div>
      )}
      {pendingEntities.length > 0 && (
        <div className="mx-4 mt-3 max-h-48 shrink-0 overflow-y-auto rounded-md border border-[var(--whale-divider)] bg-[var(--whale-card)] p-3 text-xs">
          <h3 className="mb-2 font-medium">{t('pendingEntities')}</h3>
          <div className="space-y-2">
            {pendingEntities.map((entity) => (
              <div key={`${entity.type}-${entity.title}`} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <span className="mr-1.5 rounded bg-[var(--whale-cream-deep)] px-1.5 py-0.5 text-[10px]">{typeLabel(entity.type)}</span>
                  <b>{entity.title}</b>
                  <div className="mt-1 line-clamp-2 text-[var(--whale-ink-muted)]">{entity.content}</div>
                </div>
                <Button size="sm" variant="outline" className="h-7 cursor-pointer" onClick={() => dismissEntity(entity)}>
                  {t('dismiss')}
                </Button>
                <Button size="sm" className="h-7 cursor-pointer" onClick={() => void handleAdopt(entity)}>
                  {t('adopt')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'graph' ? (
        <div className="min-h-0 flex-1 p-4">
          <KnowledgeGraph
            nodes={mergedGraph.nodes}
            edges={mergedGraph.edges}
            onNodeClick={(node) => {
              if (node.id.startsWith('application:') || node.id.startsWith('interview:')) router.push('/insights');
              else if (pages.some((page) => page.path === node.id)) {
                void openPage(node.id);
                setView('list');
              }
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--whale-divider)] px-4 py-2 lg:hidden">
            <Button variant="ghost" size="sm" aria-expanded={showLibrary} onClick={() => setShowLibrary(!showLibrary)}><List className="h-4 w-4" />{t('browsePages')}</Button>
            <span className="ml-4 truncate text-xs text-[var(--whale-ink-muted)]">{selected?.title}</span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_220px]">
          <aside aria-label={t('browsePages')} className={cn("min-h-0 overflow-y-auto border-r border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-4", showLibrary ? "block" : "hidden lg:block")}>
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="pl-8"
              />
            </div>
            {grouped.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {pages.length === 0 ? t('emptyVault') : t('emptyList')}
              </p>
            )}
            {grouped.map((group) => (
              <div key={group.kind} className="mb-3">
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {typeLabel(group.kind)}
                </div>
                <div className="space-y-0.5">
                  {group.pages.map((page) => (
                    <button
                      key={page.path}
                      data-knowledge-path={page.path}
                      type="button"
                      onClick={() => void openPage(page.path)}
                      aria-current={selectedPath === page.path ? 'page' : undefined}
                      className={cn(
                        'w-full min-w-0 cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                        selectedPath === page.path ? 'bg-[var(--whale-card)] text-[var(--whale-ink)] shadow-sm ring-1 ring-[var(--whale-divider)]' : 'text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)]',
                      )}
                    >
                      <div className="truncate font-medium">{page.title || page.path}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{page.summary || typeLabel(pageKind(page))}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <main className={cn("min-h-0 min-w-0 overflow-y-auto px-5 py-6 [overflow-wrap:anywhere] lg:px-8 lg:py-7", showLibrary && "hidden lg:block")}>
            <div className="mx-auto max-w-[760px]">
            {selectedPath ? (
              <>
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--whale-divider)] pb-5">
                  <div className="min-w-0 flex-1"><p className="mb-2 text-[11px] text-[var(--whale-ink-muted)]">{selected ? typeLabel(pageKind(selected)) : t('title')}</p><h2 className="text-xl font-semibold leading-snug">{selected?.title || selectedPath}</h2></div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 xl:hidden" aria-label={t('pageInfo')} onClick={() => setShowInfo(true)}><Info className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={toggleEditing} disabled={saving} className="cursor-pointer">
                      {editing ? t('read') : t('edit')}
                    </Button>
                    {editing && (
                      <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="cursor-pointer">
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        {saving ? t('saving') : t('save')}
                      </Button>
                    )}
                  </div>
                </div>
                {draftContent !== selectedContent && <p className="mb-4 text-xs text-[var(--whale-mint-deep)]">{t('draftPending')}</p>}
                {editing && isPurpose ? (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">{t('purposeHint')}</p>
                    {(Object.keys(PURPOSE_HEADINGS) as (keyof PurposeFields)[]).map((key) => (
                      <label key={key} className="block text-sm font-medium">
                        {t(`purpose${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
                        <Textarea
                          value={purpose[key]}
                          onChange={(event) => changeDraft({ ...purpose, [key]: event.target.value })}
                          className="mt-1"
                          rows={key === 'other' || key === 'constraints' ? 4 : 2}
                        />
                      </label>
                    ))}
                  </div>
                ) : editing ? (
                  <Textarea
                    value={draftContent}
                    onChange={(event) => changeDraft(event.target.value)}
                    aria-label={t('edit')}
                    className="min-h-[60vh] font-mono text-sm"
                    spellCheck={false}
                  />
                ) : (
                  <article className="ai-markdown max-w-none text-[14px] leading-7 [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(url) => url.startsWith(WIKILINK_SCHEME) ? url : defaultUrlTransform(url)}
                      components={{
                        a: ({ href, children }) =>
                          href?.startsWith(WIKILINK_SCHEME) ? (
                            <button
                              type="button"
                              onClick={() => openWikilink(href)}
                              className="cursor-pointer text-[var(--whale-mint-deep)] underline decoration-[rgba(168,232,216,0.5)] underline-offset-2"
                            >
                              {children}
                            </button>
                          ) : (
                            <a href={href} target="_blank" rel="noreferrer">{children}</a>
                          ),
                      }}
                    >
                      {readerMarkdown}
                    </ReactMarkdown>
                  </article>
                )}
              </>
            ) : (
              <div className="py-20 text-center text-sm text-muted-foreground">{t('selectPage')}</div>
            )}
            </div>
          </main>

          <aside className="hidden min-h-0 min-w-0 overflow-y-auto border-l border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] p-5 text-sm [overflow-wrap:anywhere] xl:block">
            <h2 className="mb-3 font-semibold">{t('pageInfo')}</h2>
            {pageDetails}
          </aside>
          </div>
        </div>
      )}
      <Sheet open={showInfo} onOpenChange={setShowInfo}>
        <SheetContent className="overflow-y-auto bg-[var(--whale-cream)] p-5 [overflow-wrap:anywhere]">
          <SheetHeader><SheetTitle>{t('pageInfo')}</SheetTitle></SheetHeader>
          {pageDetails}
        </SheetContent>
      </Sheet>
    </div>
  );
}
