import { useLayoutEffect, useRef, useState } from 'react';
import { ResumePreview } from '@/components/preview/resume-preview';
import type { Resume } from '@/types/resume';

export function VersionPreview({ resume }: { resume: Resume }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0) setWidth(el.clientWidth); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  return <div ref={viewport} data-version-preview className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll bg-[var(--app-surface-muted)] [scrollbar-gutter:stable]">
    <div className="flex justify-center p-4">
      <div className="shrink-0 bg-white shadow-md" style={{ width: 794, zoom: Math.min(1, Math.max(.1, (width - 32) / 794)), visibility: width ? 'visible' : 'hidden' }}>
        <ResumePreview resume={resume} interactive={false} />
      </div>
    </div>
  </div>;
}
