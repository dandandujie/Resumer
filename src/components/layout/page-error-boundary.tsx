import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import i18n from '@/i18n';
import { logError } from '@/stores/error-log-store';

interface State {
  error: Error | null;
}

/**
 * 页面级错误边界：任何页面渲染崩溃时只替换该页面区域，导航和其它页面仍可用，
 * 并把错误写进错误日志——不再整窗白屏。宿主按路由路径设置 key，换页即重置。
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(i18n.t('common.pageCrashed'), `${error.message}\n${info.componentStack ?? ''}`.trim());
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-[var(--whale-divider)] bg-[var(--whale-card)] p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h2 className="mt-3 text-base font-semibold text-[var(--whale-ink)]">{i18n.t('common.pageCrashed')}</h2>
          <p className="mt-2 break-words text-xs leading-relaxed text-[var(--whale-ink-muted)]">{error.message}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[var(--whale-ink)] px-4 py-2 text-xs font-medium text-[var(--whale-cream)] hover:opacity-90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {i18n.t('common.retry')}
            </button>
            <a
              href="/"
              className="inline-flex items-center rounded-full border border-[var(--whale-divider)] px-4 py-2 text-xs font-medium text-[var(--whale-ink)] hover:bg-[var(--whale-cream-deep)]"
            >
              {i18n.t('common.backHome')}
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/** 按路由路径重置的错误边界 Outlet：换页即清除上一页的崩溃状态。 */
export function BoundedOutlet() {
  const { pathname } = useLocation();
  return (
    <PageErrorBoundary key={pathname}>
      <Outlet />
    </PageErrorBoundary>
  );
}
