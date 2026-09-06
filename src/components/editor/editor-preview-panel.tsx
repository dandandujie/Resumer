'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ResumePreview } from '@/components/preview/resume-preview';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { useClassicPageEstimate } from '@/hooks/use-classic-page-estimate';
import { useIsMobile } from "@/hooks/use-media-query";
import { SmartFitButton } from '@/components/editor/smart-fit-button';
import { FormatRibbon } from '@/components/editor/format-ribbon';
import type { Resume, ResumeSection } from '@/types/resume';

// A4 width in px (at 96 dpi)
const A4_WIDTH = 794;

export function EditorPreviewPanel() {
  const t = useTranslations('editor.toolbar');
  const { currentResume, sections, reorderSections } = useResumeStore();
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot);
  const showThemeEditor = useEditorStore((s) => s.showThemeEditor);
  const [zoom, setZoom] = useState(80);
  const locale = useLocale();
  const isMobile = useIsMobile();

  const liveResume = useMemo<Resume | null>(() => {
    if (!currentResume) return null;
    return { ...currentResume, sections };
  }, [currentResume, sections]);

  const handleReorderSections = useCallback(
    (newSections: ResumeSection[]) => {
      pushSnapshot(sections);
      reorderSections(newSections);
    },
    [sections, pushSnapshot, reorderSections]
  );

  // Hook must run unconditionally (before any early return) per rules-of-hooks.
  const { estimate, loading } = useClassicPageEstimate(liveResume);

  if (!liveResume) return null;

  const scale = zoom / 100;
  const overflowPreview = estimate?.overflowSections.slice(0, 2).join('、') || '';
  const isZh = locale === 'zh';

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--whale-cream-soft)]">
      {showThemeEditor && <FormatRibbon />}
      {/* Header */}
      <div className="hidden shrink-0 items-center justify-between border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-2 md:flex">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--whale-ink-muted)]">{t('preview')}</span>
          <div className="mt-1 flex min-h-5 items-center gap-2 text-[11px]">
            {loading ? (
              <span className="inline-flex items-center gap-1 text-[var(--whale-ink-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isZh ? '正在预估页数' : 'Estimating pages'}
              </span>
            ) : estimate ? (
              <>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    estimate.pageCount > 1
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-[var(--whale-mint)]/40 text-[var(--whale-ink)]'
                  }`}
                >
                  {isZh ? `预估 ${estimate.pageCount} 页` : `${estimate.pageCount} page${estimate.pageCount > 1 ? 's' : ''}`}
                </span>
                {estimate.overflowSections.length > 0 && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {isZh
                        ? `超页风险：${overflowPreview}${estimate.overflowSections.length > 2 ? '等' : ''}`
                        : `Likely overflow: ${estimate.overflowSections.slice(0, 2).join(', ')}${estimate.overflowSections.length > 2 ? '…' : ''}`}
                    </span>
                  </span>
                )}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SmartFitButton />
          <div className="flex items-center gap-1 rounded-full bg-[var(--whale-cream-soft)] p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 cursor-pointer p-0 text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
              onClick={() => setZoom((z) => Math.max(30, z - 10))}
              disabled={zoom <= 30}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-10 text-center text-xs font-medium tabular-nums text-[var(--whale-ink-soft)]">{zoom}%</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 cursor-pointer p-0 text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
              onClick={() => setZoom((z) => Math.min(150, z + 10))}
              disabled={zoom >= 150}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Preview body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex justify-center p-2 md:p-4">
          <div
            className="bg-white shadow-[0_18px_36px_-18px_rgba(28,26,23,0.18)] ring-1 ring-[var(--whale-divider)] transition-all duration-300"
            style={{
              width: isMobile ? "100%" : A4_WIDTH,
              maxWidth: A4_WIDTH,
              zoom: isMobile ? undefined : scale,
            }}
          >
            <ResumePreview resume={liveResume} interactive={true} onReorderSections={handleReorderSections} />
          </div>
        </div>
      </div>
    </div>
  );
}
