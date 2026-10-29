/**
 * Preview page — read-only A4 view with PDF export.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@/i18n';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';
import { ResumePreview } from '@/components/preview/resume-preview';
import { usePdfExport } from '@/hooks/use-pdf-export';
import { useDesignAttribute } from '@/hooks/use-design-attribute';
import * as api from '@/lib/tauri-api';
import type { Resume } from '@/types/resume';
const OriginalDocumentEditor = lazy(() => import('@/components/editor/original-document-editor'));

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations();
  const { exportPdf, isExporting } = usePdfExport();
  const [resume, setResume] = useState<Resume | null>(null);
  useDesignAttribute('whale');

  useEffect(() => {
    api.getResume(id!)
      .then((data) => setResume(data as Resume))
      .catch(console.error);
  }, [id]);

  if (!resume) {
    return (
      <div data-design="whale" className="flex h-screen items-center justify-center bg-[var(--whale-cream)] text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (resume.template === 'original-docx') {
    return <Suspense fallback={null}><OriginalDocumentEditor resume={resume} readOnly /></Suspense>;
  }

  return (
    <div data-design="whale" className="min-h-screen bg-[var(--whale-cream)]">
      {/* pl-20 clears the macOS traffic lights (titleBarStyle: Overlay) */}
      <div
        data-tauri-drag-region
        className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--whale-divider)] bg-[var(--whale-sidebar)] py-2 pl-20 pr-4"
      >
        <Button variant="ghost" size="sm" onClick={() => router.push(`/editor/${id}`)} className="cursor-pointer gap-1 text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]">
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        <Button size="sm" disabled={isExporting} onClick={() => exportPdf(id!, resume.title)} className="cursor-pointer gap-1 bg-brand hover:bg-brand-hover">
          <Download className="h-4 w-4" />
          {isExporting ? t('pdf.exporting') : t('editor.toolbar.export')}
        </Button>
      </div>
      <div className="p-8 pb-20 sm:pb-8">
        <div className="mx-auto max-w-[794px] bg-white shadow-[0_18px_36px_-18px_rgba(28,26,23,0.25)] ring-1 ring-[var(--whale-divider)]">
          <ResumePreview resume={resume} />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-[var(--whale-divider)] bg-[var(--whale-cream)] p-3 sm:hidden">
        <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => router.push(`/editor/${id}`)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t('common.back')}
        </Button>
        <Button className="flex-1 cursor-pointer bg-brand hover:bg-brand-hover" onClick={() => exportPdf(id!, resume.title)} disabled={isExporting}>
          <Download className="mr-1.5 h-4 w-4" />
          {isExporting ? t('pdf.exporting') : t('editor.toolbar.export')}
        </Button>
      </div>
    </div>
  );
}
