'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, FileClock, History, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useJournalStore } from '@/stores/journal-store';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { compareResumeVersions } from '@/lib/resume-version-diff';
import * as api from '@/lib/tauri-api';
import { VersionPreview } from './version-preview';
import type { Resume } from '@/types/resume';
import { cn } from '@/lib/utils';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  onRestored: () => Promise<void> | void;
}
const OriginalDocumentCanvas = lazy(() => import('./original-document-canvas').then(module => ({ default: module.OriginalDocumentCanvas })));
const events = new Set(['save', 'manual', 'import', 'export', 'apply', 'ai_accept', 'restore']);

export function VersionHistoryDialog({ open, onOpenChange, resumeId, onRestored }: VersionHistoryDialogProps) {
  const t = useTranslations('versionHistory');
  const common = useTranslations('common');
  const locale = useLocale();
  const current = useResumeStore(s => s.currentResume);
  const dirty = useResumeStore(s => s.isDirty);
  const applications = useJournalStore(s => s.applications);
  const [versions, setVersions] = useState<api.ResumeVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<api.ResumeVersionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<'preview' | 'compare'>('preview');
  const [form, setForm] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'restore' | 'delete' | null>(null);
  const generation = useRef(0);
  const selectionRequest = useRef(0);
  const formatTime = (seconds: number) => new Date(seconds * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const eventLabel = (event: string) => events.has(event) ? t(`event.${event}`) : t('event.other');
  const contextOf = (version: api.ResumeVersionSummary) => {
    if (version.event === 'apply') {
      const application = applications.find(a => a.resumeVersionId === version.id);
      const target = application ? [application.company, application.role].filter(Boolean).join(' · ') : version.label;
      return target ? t('appliedTo', { target }) : '';
    }
    if (version.event === 'export') return version.label ? t('exportedAs', { format: version.label }) : '';
    return version.events?.length ? version.events.filter(event => event.event !== 'manual').map(event => [eventLabel(event.event),event.label].filter(Boolean).join(' · ')).join(' / ') : version.event === 'manual' ? '' : version.label;
  };
  const titleOf = (version: api.ResumeVersionSummary) => version.name || (version.event === 'manual' ? version.label : '') || contextOf(version) || eventLabel(version.event);

  const selectVersion = useCallback(async (id: string | null) => {
    const request = ++selectionRequest.current;
    setSelected(id); setDetail(null); setDetailError(''); setDetailLoading(!!id); setForm(null);
    if (!id) return;
    try {
      const value = await api.getResumeVersion(id);
      if (request !== selectionRequest.current) return;
      if (!value || value.resumeId !== resumeId) throw new Error(t('missing'));
      setDetail(value);
    } catch (cause) {
      if (request === selectionRequest.current) setDetailError(String((cause as Error).message || cause));
    } finally { if (request === selectionRequest.current) setDetailLoading(false); }
  }, [resumeId, t]);

  const load = useCallback(async (preferred: string | null = null) => {
    const request = generation.current;
    setLoading(true); setError('');
    try {
      const list = await api.listResumeVersions(resumeId);
      if (request !== generation.current) return;
      setVersions(list);
      await selectVersion(preferred && list.some(v => v.id === preferred) ? preferred : null);
    } catch (cause) {
      if (request === generation.current) setError(String((cause as Error).message || cause));
    } finally { if (request === generation.current) setLoading(false); }
  }, [resumeId, selectVersion]);

  useEffect(() => {
    if (!open) return;
    const lifetime = generation;
    const selection = selectionRequest;
    lifetime.current++;
    const pending = useEditorStore.getState().pendingVersionId;
    useEditorStore.getState().setPendingVersionId(null);
    const timer = window.setTimeout(() => {
      setQuery(''); setFilter('all'); setView('preview'); setConfirm(null); setForm(null);
      void load(pending);
    }, 0);
    return () => { window.clearTimeout(timer); lifetime.current++; selection.current++; };
  }, [open, load]);

  const chosen = versions.find(v => v.id === selected);
  const linked = !!selected && applications.some(a => a.resumeVersionId === selected);
  const preview = (selected ? detail?.snapshot : current) as Resume | null;
  const original = preview?.template === 'original-docx';
  const changes = useMemo(() => detail?.snapshot && current && detail.snapshot.template !== 'original-docx' && current.template !== 'original-docx' ? compareResumeVersions(detail.snapshot, current) : null, [detail, current]);
  const same = !!selected && !!changes && changes.length === 0;
  const visible = versions.filter(version => {
    const matches = filter === 'all' || (filter === 'named' ? !!version.name || version.event === 'manual' : version.event === filter || !!version.events?.some(event => event.event === filter));
    return matches && [titleOf(version), contextOf(version), version.resumeTitle, formatTime(version.createdAt)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase().trim());
  });

  const mutate = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(String((cause as Error).message || cause)); }
    finally { setBusy(false); }
  };
  const saveName = () => void mutate(async () => {
    const value = name.trim();
    if (!value || [...value].length > 80) throw new Error(t('nameInvalid'));
    if (form === 'new') {
      await useResumeStore.getState().flushPendingSave();
      const id = await api.createResumeVersion(resumeId, 'manual', value);
      if (!id) throw new Error(t('saveFailed'));
      setQuery(''); setFilter('all'); await load(id);
      toast.success(t('created'), { position: 'bottom-right' });
    } else if (selected) {
      await api.renameResumeVersion(selected, value); await load(selected);
      toast.success(t('renamed'), { position: 'bottom-right' });
    }
    setForm(null);
  });
  const restore = () => void mutate(async () => {
    if (!selected || !detail) return;
    // 先等待所有草稿写入，再在后端事务里保护草稿并恢复；失败时保留对话框。
    await useResumeStore.getState().flushPendingSave();
    await api.restoreResumeVersion(selected, t('restoreLabel', { time: formatTime(Date.now() / 1000) }));
    await onRestored(); setConfirm(null); onOpenChange(false);
    toast.success(t('restored'), { position: 'bottom-right' });
  });
  const remove = () => void mutate(async () => {
    if (!selected) return;
    await api.deleteResumeVersion(selected); setConfirm(null); await load(null);
    toast.success(t('deleted'), { position: 'bottom-right' });
  });

  return <>
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent data-version-workspace className="flex w-[calc(100vw-32px)] h-[min(850px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        <DialogHeader className="shrink-0 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--app-border)] px-4 py-3">
          <Button size="sm" className="gap-1.5" disabled={busy || loading} onClick={() => { setName(''); setForm('new'); }}><Plus className="h-4 w-4" />{t('create')}</Button>
          <span className="text-xs text-[var(--app-text-muted)]">{t('policy')}</span>
          {form && <form className="flex w-full flex-wrap gap-2" onSubmit={event => { event.preventDefault(); saveName(); }}>
            <input autoFocus maxLength={80} aria-label={t('name')} placeholder={t('namePlaceholder')} className="h-9 min-w-0 flex-1 rounded-md border bg-[var(--app-surface)] px-3 text-sm" value={name} onChange={event => setName(event.target.value)} disabled={busy} />
            <Button variant="primary" type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{form === 'new' ? t('create') : t('rename')}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setForm(null)} aria-label={common('cancel')}><X className="h-4 w-4" /></Button>
          </form>}
        </div>
        {error && <div role="alert" className="flex shrink-0 items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"><span className="min-w-0 break-words">{error}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => void load(selected)}>{t('retry')}</Button></div>}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(175px,38%)_minmax(0,1fr)] md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-1">
          <aside className="flex min-h-0 min-w-0 flex-col border-b border-[var(--app-border)] bg-[var(--app-sidebar)] md:border-b-0 md:border-r">
            <button type="button" data-current-draft aria-current={!selected ? 'true' : undefined} disabled={busy} onClick={() => { void selectVersion(null); setView('preview'); }} className={cn('m-3 mb-2 flex items-center gap-3 rounded-lg border p-3 text-left', !selected ? 'border-[var(--app-accent)] bg-[var(--app-surface)]' : 'border-transparent hover:bg-[var(--app-hover)]')}>
              <FileClock className="h-5 w-5 shrink-0 text-[var(--app-accent)]" /><span className="min-w-0"><strong className="block text-sm">{t('current')}</strong><span className="block text-xs text-[var(--app-text-muted)]">{dirty ? t('unsavedDraft') : t('savedDraft')}</span></span>
            </button>
            <div className="flex gap-2 px-3 pb-2">
              <label className="flex min-w-0 flex-1 items-center gap-1 rounded-md border bg-[var(--app-surface)] px-2"><Search className="h-3.5 w-3.5 shrink-0" /><input aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => setQuery(event.target.value)} className="h-8 min-w-0 w-full bg-transparent text-xs outline-none" /></label>
              <select aria-label={t('filterLabel')} value={filter} onChange={event => setFilter(event.target.value)} className="min-w-0 max-w-28 rounded-md border bg-[var(--app-surface)] px-1 text-xs">{['all', 'named', 'save', 'import', 'export', 'apply', 'ai_accept', 'restore'].map(value => <option key={value} value={value}>{value === 'all' || value === 'named' ? t(`filter.${value}`) : eventLabel(value)}</option>)}</select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {loading ? <p role="status" className="flex items-center gap-2 p-4 text-xs"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</p> : !visible.length ? <p className="p-4 text-xs leading-6 text-[var(--app-text-muted)]">{versions.length ? t('noResults') : t('empty')}</p> : <ol className="space-y-1">{visible.map(version => <li key={version.id}>
                <button type="button" data-resume-version={version.id} disabled={busy} onClick={() => void selectVersion(version.id)} aria-current={selected === version.id ? 'true' : undefined} className={cn('w-full rounded-lg border px-3 py-3 text-left', selected === version.id ? 'border-[var(--app-accent)] bg-[var(--app-surface)] shadow-sm' : 'border-transparent hover:bg-[var(--app-hover)]')}>
                  <span className="block break-words text-sm font-medium">{titleOf(version)}</span>
                  <span className="mt-1 block text-[11px] tabular-nums text-[var(--app-text-muted)]">{formatTime(version.createdAt)}</span>
                  <span className="mt-2 inline-block rounded bg-[var(--app-hover)] px-1.5 py-0.5 text-[10px]">{[...new Set((version.events?.length ? version.events : [{event: version.event}]).map(event => eventLabel(event.event)))].join(' · ')}</span>
                  {version.name && contextOf(version) && <span className="mt-1 block break-words text-[11px] text-[var(--app-text-secondary)]">{contextOf(version)}</span>}
                </button>
              </li>)}</ol>}
            </div>
          </aside>
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
              <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{chosen ? titleOf(chosen) : t('current')}</h3><p className="mt-1 text-xs text-[var(--app-text-muted)]">{chosen ? formatTime(chosen.createdAt) : t('currentHint')}</p></div>
              {chosen && <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" title={t('rename')} disabled={busy || detailLoading || !detail} onClick={() => { setName(chosen.name || titleOf(chosen)); setForm('rename'); }}><Pencil className="h-3.5 w-3.5" />{t('rename')}</Button>
                <Button size="sm" variant="ghost" disabled={busy || linked || !detail} title={linked ? t('linkedProtected') : t('delete')} onClick={() => setConfirm('delete')}><Trash2 className="h-3.5 w-3.5" />{t('delete')}</Button>
              </div>}
            </div>
            {selected && <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] px-4 py-2">
              <div role="tablist" aria-label={t('detailView')} className="flex gap-1">{(['preview', 'compare'] as const).map(tab => <button key={tab} id={`version-${tab}-tab`} role="tab" aria-controls="version-detail-panel" tabIndex={view === tab ? 0 : -1} aria-selected={view === tab} onKeyDown={event => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = tab === 'preview' ? 'compare' : 'preview'; setView(next); document.getElementById(`version-${next}-tab`)?.focus(); }
              }} onClick={() => setView(tab)} className={cn('rounded-md px-3 py-1.5 text-xs', view === tab ? 'bg-[var(--app-hover)] font-semibold' : 'text-[var(--app-text-muted)]')}>{t(tab)}{tab === 'compare' && changes ? ` · ${changes.length}` : ''}</button>)}</div>
              {same && <span className="text-xs text-[var(--app-accent)]">{t('identical')}</span>}
            </div>}
            <div id="version-detail-panel" role={selected ? "tabpanel" : undefined} aria-labelledby={selected ? `version-${view}-tab` : undefined} className="flex min-h-0 flex-1 flex-col">
            {detailLoading ? <div role="status" className="grid min-h-0 flex-1 place-content-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : detailError ? <div role="alert" className="min-h-0 flex-1 overflow-auto p-5 text-sm text-red-700">{detailError}<Button className="mt-3 block" variant="outline" onClick={() => void selectVersion(selected)}>{t('retry')}</Button></div> : view === 'compare' && selected ? <div data-version-comparison className="min-h-0 flex-1 space-y-3 overflow-auto bg-[var(--app-surface-muted)] p-4">
              {!changes ? <p className="text-sm leading-6">{t('originalCompare')}</p> : !changes.length ? <p className="p-5 text-sm">{t('noChanges')}</p> : <>{<p className="text-xs text-[var(--app-text-muted)]">{t('compareHint')}</p>}{changes.map(change => <article key={change.key} className="overflow-hidden rounded-lg border bg-[var(--app-surface)]">
                <h4 className="border-b px-3 py-2 text-sm font-medium">{change.title || t(`change.${change.kind}`)}<span className="ml-2 text-xs font-normal text-[var(--app-text-muted)]">{change.title ? t(`change.${change.kind}`) : ''}</span></h4>
                {['theme', 'format'].includes(change.kind) ? <p className="p-3 text-sm text-[var(--app-text-muted)]">{t(`changeHint.${change.kind}`)}</p> : <div className="grid grid-cols-1 sm:grid-cols-2">{[['before', change.before], ['after', change.after]].map(([side, value]) => <div key={side} className="min-w-0 border-b p-3 last:border-0 sm:border-b-0 sm:border-r"><p className="mb-2 text-[11px] font-semibold text-[var(--app-text-muted)]">{t(side)}</p><p className="whitespace-pre-wrap break-words text-xs leading-6">{change.kind === 'visibility' ? t(value === 'true' ? 'visible' : 'hidden') : value || '—'}</p></div>)}</div>}
              </article>)}</>}
            </div> : preview ? original ? <div className="min-h-0 flex-1 overflow-auto"><Suspense fallback={<p className="p-4">{t('loading')}</p>}><OriginalDocumentCanvas key={selected || 'current'} resumeId={resumeId} versionId={selected || undefined} readOnly /></Suspense></div> : <VersionPreview resume={preview} /> : <p className="min-h-0 flex-1 p-5 text-sm">{t('selectVersion')}</p>}
            </div>
          </section>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-[var(--app-text-muted)]">{linked ? t('linkedProtected') : t('restoreSafety')}</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t('done')}</Button>
          {selected && <Button size="sm" disabled={busy || detailLoading || !detail || same} onClick={() => setConfirm('restore')}><RotateCcw className="h-4 w-4" />{t('restore')}</Button>}
        </footer>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!confirm} onOpenChange={next => { if (!busy && !next) setConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{confirm === 'delete' ? t('deleteTitle') : t('restoreConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{confirm === 'delete' ? t('deleteBody') : t('restoreConfirmBody')}</AlertDialogDescription></AlertDialogHeader>
        {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{common('cancel')}</AlertDialogCancel><AlertDialogAction variant={confirm === 'delete' ? 'destructive' : 'primary'} disabled={busy} onClick={event => { event.preventDefault(); if (confirm === 'delete') remove(); else restore(); }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm === 'delete' ? t('delete') : t('restore')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
