import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Download, History, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { OriginalDocumentCanvas, type OriginalDocumentHandle } from './original-document-canvas';
import { VersionHistoryDialog } from './version-history-dialog';
import type { DocumentSaveState } from '@/lib/document-save-session';
import type { Resume } from '@/types/resume';
import * as api from '@/lib/tauri-api';
import { JournalDialog } from './journal-dialog';
import { JdAnalysisDialog } from './jd-analysis-dialog';
import { CoverLetterDialog } from './cover-letter-dialog';
import { InterviewDialog } from './interview-dialog';
import { useUIStore } from '@/stores/ui-store';

export default function OriginalDocumentEditor({ resume, readOnly = false, onRestored }: { resume: Resume; readOnly?: boolean; onRestored?: () => Promise<void> }) {
  const t = useTranslations('originalDocument');
  const router = useRouter();
  const editor = useRef<OriginalDocumentHandle>(null);
  const [state, setState] = useState<DocumentSaveState | 'loading' | 'load-error'>('loading');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [generation, setGeneration] = useState(0);
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const onState = useCallback((value: typeof state) => setState(value), []);
  const act = useCallback(async (action?: () => void | Promise<void>) => {
    if (!editor.current) return;
    setBusy(true);
    try { await editor.current.save(); await action?.(); }
    catch (error) { toast.error((error as Error)?.message || t('error'), { position: 'bottom-right' }); }
    finally { setBusy(false); }
  }, [t]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); void act();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [act]);
  const disabled = busy || state === 'loading' || state === 'load-error';
  return <div className="flex h-screen min-w-0 flex-col bg-[var(--whale-cream)]">
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--whale-divider)] px-4 pl-20">
      <Button variant="ghost" size="icon" aria-label={t('back')} disabled={busy} onClick={() => state === 'load-error' || state === 'loading' ? router.push('/dashboard') : void act(() => router.push('/dashboard'))}><ArrowLeft className="h-4 w-4" /></Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{resume.title}</h1>
        <p className="mt-0.5 text-xs text-[var(--whale-ink-muted)]">{t('mode')} · <span role="status">{t(state)}</span></p>
      </div>
      {!readOnly && <>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void act(() => openModal('journal'))}>{t('journal')}</Button>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void act(() => setHistory(true))}><History className="h-4 w-4" /><span className="hidden sm:inline">{t('history')}</span></Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => void act()}><Save className="h-4 w-4" />{t('save')}</Button>
      </>}
      {state === 'error' && <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try { if (editor.current) await api.saveDocxCopy(`${resume.title}.docx`, await editor.current.bytes()); }
        catch (error) { toast.error((error as Error)?.message || String(error), { position: 'bottom-right' }); }
        finally { setBusy(false); }
      }}>{t('rescueCopy')}</Button>}
      {state === 'load-error' && <Button size="sm" onClick={() => setGeneration((value) => value + 1)}>{t('retry')}</Button>}
      <Button size="sm" disabled={disabled} onClick={() => void act(async () => {
        const path = await api.exportOriginalDocx(resume.id);
        if (path) await api.createResumeVersion(resume.id, 'export', 'DOCX');
      })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} DOCX</Button>
    </header>
    <div className="min-h-0 flex-1"><OriginalDocumentCanvas key={`${resume.id}-${generation}`} ref={editor} resumeId={resume.id} readOnly={readOnly} onState={onState} /></div>
    <VersionHistoryDialog open={history} onOpenChange={setHistory} resumeId={resume.id} onRestored={async () => { setHistory(false); await onRestored?.(); setGeneration((value) => value + 1); }} />
    {!readOnly && <>
      <JournalDialog open={activeModal === 'journal'} onOpenChange={(open) => open ? openModal('journal') : closeModal()} resumeId={resume.id} />
      <JdAnalysisDialog open={activeModal === 'jd-analysis'} onOpenChange={(open) => open ? openModal('jd-analysis') : closeModal()} resumeId={resume.id} />
      <CoverLetterDialog open={activeModal === 'cover-letter'} onOpenChange={(open) => open ? openModal('cover-letter') : closeModal()} resumeId={resume.id} />
      <InterviewDialog />
    </>}
  </div>;
}
