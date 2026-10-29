import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { DocxEditor, LocaleProvider, useFonts } from '@docx-editor.dev/react';
import type { Editor } from '@docx-editor.dev/core';
import { packagedFonts } from '@docx-editor.dev/fonts';
import { en, zhCN } from '@docx-editor.dev/i18n';
import { useLocale, useTranslations } from 'next-intl';
import '@docx-editor.dev/react/styles.css';
import './original-document.css';
import * as api from '@/lib/tauri-api';
import { DocumentSaveSession, type DocumentSaveState } from '@/lib/document-save-session';
import { OriginalDocumentSpacing } from './original-document-spacing';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';

export interface OriginalDocumentHandle { save: () => Promise<void>; bytes: () => Promise<number[]>; }
interface Props {
  resumeId: string;
  versionId?: string;
  readOnly?: boolean;
  onState?: (state: DocumentSaveState | 'loading' | 'load-error', error?: string) => void;
}
// 仅使用随应用分发的开源字体，不向远程字体服务发送文档所需的字体信息。
const fontOrigin = packagedFonts();
const zoomMode = { type: 'fit' as const, fit: 'pageWidth' as const, minZoom: 0.7, maxZoom: 1 };
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
// 应用内导航失败仍保留抢救副本；重新进入时先等待旧写入结束，再决定使用的 revision。
const pendingDocuments = new Map<string, Promise<{ bytes: number[]; revision: number } | null>>();

export const OriginalDocumentCanvas = forwardRef<OriginalDocumentHandle, Props>(function OriginalDocumentCanvas(
  { resumeId, versionId, readOnly = false, onState }, ref,
) {
  const fonts = useFonts(fontOrigin);
  const engine = useRef<Editor | null>(null);
  const [document, setDocument] = useState<Uint8Array>();
  const [activeEngine, setActiveEngine] = useState<Editor | null>(null);
  const session = useRef<DocumentSaveSession | null>(null);
  const committed = useRef<number[]>([]);
  const recovering = useRef(false);
  const [error, setError] = useState('');
  const t = useTranslations('originalDocument');
  const locale = useLocale();
  const serialize = useCallback(async () => {
    if (!engine.current) throw new Error(t('loading'));
    return Array.from(new Uint8Array(await engine.current.save()));
  }, [t]);
  useImperativeHandle(ref, () => ({
    save: async () => { if (!engine.current) throw new Error(t('loading')); await session.current?.flush(); },
    // 未修改时返回原字节，避免仅打开文件就触发重新序列化。
    bytes: () => session.current?.dirty ? serialize() : Promise.resolve(committed.current),
  }), [serialize, t]);

  useEffect(() => {
    let disposed = false;
    onState?.('loading');
    void (async () => {
      const recovery = !readOnly && !versionId ? await pendingDocuments.get(resumeId) : null;
      const data = await api.getOriginalDocx(resumeId, versionId);
      return { data, recovery };
    })().then(({ data, recovery }) => {
      if (disposed) return;
      committed.current = data.bytes;
      recovering.current = !!recovery;
      session.current = new DocumentSaveSession(recovery?.revision ?? data.revision, serialize, async (revision, bytes) => {
        const next = await api.saveOriginalDocx(resumeId, revision, bytes);
        committed.current = bytes;
        pendingDocuments.delete(resumeId);
        return next;
      }, (state, cause) => {
        if (!disposed) { setError(cause ? message(cause) : ''); onState?.(state, cause ? message(cause) : undefined); }
      });
      setDocument(new Uint8Array(recovery?.bytes ?? data.bytes));
    }).catch((cause) => { if (!disposed) { setError(message(cause)); onState?.('load-error', message(cause)); } });
    return () => { disposed = true; };
  }, [resumeId, versionId, readOnly, onState, serialize]);

  // 父层 layout cleanup 先于子编辑器销毁，必须在这里取到最后一次文档状态。
  useLayoutEffect(() => () => {
    const current = session.current;
    if (!current?.dirty || !engine.current) return;
    const bytes = engine.current.save().then((buffer) => Array.from(new Uint8Array(buffer)));
    const result = current.finish(bytes).then(() => null, async (cause) => {
      toast.error(message(cause));
      return { bytes: await bytes, revision: current.currentRevision };
    });
    pendingDocuments.set(resumeId, result);
    void result.catch((cause) => toast.error(message(cause)));
  }, [resumeId]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (session.current?.dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let closing = false;
    if (isTauri() && !readOnly) {
      void getCurrentWindow().onCloseRequested(async (event) => {
        if (closing || !session.current?.dirty) return;
        event.preventDefault();
        try { await session.current.flush(); closing = true; await getCurrentWindow().close(); }
        catch (cause) { setError(message(cause)); }
      }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch((cause) => setError(message(cause)));
    }
    return () => { disposed = true; window.removeEventListener('beforeunload', beforeUnload); unlisten?.(); };
  }, [readOnly]);
  const ready = useCallback((value: Editor) => {
    engine.current = value;
    setActiveEngine(value);
    if (recovering.current) { recovering.current = false; session.current?.changed(); }
    else onState?.('saved');
  }, [onState]);
  useEffect(() => activeEngine?.on('error', (cause) => { setError(message(cause)); onState?.('error', message(cause)); }), [activeEngine, onState]);

  return <div className="original-document docx-editor flex h-full min-h-0 flex-col" data-original-document>
    {error && <p role="alert" className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
    {document && <LocaleProvider i18n={locale === 'zh' ? zhCN : en}>
      <DocxEditor.Root document={document} fonts={fonts} locale={locale === 'zh' ? 'zh-CN' : 'en-US'} mode={readOnly ? 'view' : 'edit'} zoomMode={zoomMode}
        onReady={ready} onChange={(change) => { if (!readOnly && !change.source) session.current?.changed(); }}
        onFontError={(cause) => setError(message(cause))}>
        {!readOnly && <>
          <DocxEditor.Toolbar preset={false} className="shrink-0" overflow={false}>
            <DocxEditor.Toolbar.Undo /><DocxEditor.Toolbar.Redo />
            <DocxEditor.Toolbar.FontFamily /><DocxEditor.Toolbar.FontSize />
            <DocxEditor.Toolbar.Bold /><DocxEditor.Toolbar.Italic /><DocxEditor.Toolbar.Underline />
            <DocxEditor.Toolbar.FontColor /><DocxEditor.Toolbar.Highlight /><DocxEditor.Toolbar.ClearFormatting />
            <DocxEditor.Toolbar.AlignLeft /><DocxEditor.Toolbar.AlignCenter /><DocxEditor.Toolbar.AlignRight />
            <DocxEditor.Toolbar.BulletList /><DocxEditor.Toolbar.NumberedList />
            <DocxEditor.Toolbar.ImageInsert /><DocxEditor.Toolbar.TableInsert /><DocxEditor.Toolbar.Zoom />
          </DocxEditor.Toolbar>
          <OriginalDocumentSpacing engine={activeEngine} />
        </>}
        <DocxEditor.FontNotice />
        <DocxEditor.Viewport className="min-h-0 flex-1 overflow-auto bg-[var(--whale-cream-deep)]">
          <DocxEditor.Content />
          <DocxEditor.HeaderFooterChrome />
        </DocxEditor.Viewport>
        <DocxEditor.Loading />
      </DocxEditor.Root>
    </LocaleProvider>}
  </div>;
});
