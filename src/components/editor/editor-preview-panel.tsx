'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ResumePreview } from '@/components/preview/resume-preview';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { useClassicPageEstimate } from '@/hooks/use-classic-page-estimate';
import { SmartFitButton } from '@/components/editor/smart-fit-button';
import { useActiveFieldHighlight } from '@/components/preview/use-active-field-highlight';
import type { Resume, ResumeSection } from '@/types/resume';

// A4 width in px (at 96 dpi)
const A4_WIDTH = 794;

export function EditorPreviewPanel() {
  const t = useTranslations('editor.toolbar');
  const { currentResume, sections, reorderSections } = useResumeStore();
  const pushSnapshot = useEditorStore((s) => s.pushSnapshot);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // 默认完整展示纸张；需要看细节时可手动放大，缩放不改变导出字号。
  const zoom = manualZoom ?? Math.min(100, Math.max(10, Math.floor(((availableWidth ?? A4_WIDTH + 32) - 32) / A4_WIDTH * 100)));
  const locale = useLocale();

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
  const pageRef = useRef<HTMLDivElement>(null);
  useActiveFieldHighlight(pageRef);

  const hasResume = !!liveResume;
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measureWidth = () => {
      const width = viewport.clientWidth;
      // 隐藏的移动端页签没有可用宽度，保留上次缩放，显示后再测量。
      if (width > 0) setAvailableWidth((previous) => previous === width ? previous : width);
    };
    measureWidth();
    // 监听外框，不让纸张高度变化反过来驱动自动缩放。
    const observer = new ResizeObserver(measureWidth);
    observer.observe(viewport, { box: 'border-box' });
    return () => observer.disconnect();
  }, [hasResume]);

  if (!liveResume) return null;

  const scale = zoom / 100;
  const overflowPreview = estimate?.overflowSections.slice(0, 2).join('、') || '';
  const isZh = locale === 'zh';

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--whale-cream-soft)]">
      {/* Header */}
      <div className="hidden shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--whale-divider)] bg-[var(--whale-card)] px-4 py-2 md:flex">
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
              aria-label={isZh ? '缩小预览' : 'Zoom out'}
              onClick={() => setManualZoom(Math.max(10, zoom - 10))}
              disabled={zoom <= 10}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button type="button" title={isZh ? '适合页面宽度' : 'Fit page width'} onClick={() => setManualZoom(null)} className="w-10 cursor-pointer text-center text-xs font-medium tabular-nums text-[var(--whale-ink-soft)]">{zoom}%</button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 cursor-pointer p-0 text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)] hover:text-[var(--whale-ink)]"
              aria-label={isZh ? '放大预览' : 'Zoom in'}
              onClick={() => setManualZoom(Math.min(150, zoom + 10))}
              disabled={zoom >= 150}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Preview body */}
      {/* 纵向滚动条始终预留位置，切断“缩放 → 滚动条出现/消失 → 宽度 → 缩放”的循环。 */}
      <div ref={viewportRef} data-preview-viewport className="min-h-0 flex-1 overflow-x-auto overflow-y-scroll [scrollbar-gutter:stable]">
        <div className="flex w-max min-w-full justify-center p-4">
          <div
            ref={pageRef}
            className="shrink-0 bg-white shadow-[0_18px_36px_-18px_rgba(28,26,23,0.18)] ring-1 ring-[var(--whale-divider)]"
            style={{
              width: A4_WIDTH,
              maxWidth: A4_WIDTH,
              zoom: scale,
              visibility: availableWidth === null ? 'hidden' : undefined,
            }}
          >
            <ResumePreview resume={liveResume} interactive={true} onReorderSections={handleReorderSections} />
          </div>
        </div>
      </div>
    </div>
  );
}
