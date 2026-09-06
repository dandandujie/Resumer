import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import i18n from '@/i18n';
import { locales } from '@/i18n/config';
import { useDesignAttribute } from '@/hooks/use-design-attribute';
import { startWindowDrag } from '@/lib/window-drag';

// Layouts
import { WhaleDashboardShell } from '@/components/layout/whale-dashboard-shell';

// Pages (lazy imports not needed for desktop app)
import DashboardPage from '@/pages/dashboard';
import InsightsOverviewPage from '@/pages/insights-overview';
import EditorPage from '@/pages/editor';
import PreviewPage from '@/pages/preview';
import KnowledgePage from '@/pages/knowledge';

// Resolve the user's preferred locale (persisted by i18next) instead of
// hardcoding zh, so English users land on English routes after a restart.
function preferredLocale(): string {
  const lang = (i18n.language || 'zh').split('-')[0];
  return (locales as readonly string[]).includes(lang) ? lang : 'zh';
}

function LocaleProvider() {
  const { locale } = useParams<{ locale: string }>();

  useEffect(() => {
    if (locale && locale !== i18n.language) {
      i18n.changeLanguage(locale);
    }
  }, [locale]);

  return <Outlet />;
}

function EditorLayout() {
  useDesignAttribute('whale');
  return (
    <div data-design="whale" className="relative h-screen overflow-hidden bg-[var(--whale-cream)] text-[var(--whale-ink)]">
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-[100] h-5 cursor-default"
        aria-hidden
        onMouseDown={(event) => {
          if (event.button === 0) startWindowDrag();
        }}
      />
      <Outlet />
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      {/* Default redirect to dashboard in the preferred locale */}
      <Route path="/" element={<Navigate to={`/${preferredLocale()}/dashboard`} replace />} />

      {/* Locale-scoped routes */}
      <Route path="/:locale" element={<LocaleProvider />}>
        <Route index element={<Navigate to="dashboard" replace />} />

        {/* 工作台 + 求职动态共用同一个壳 */}
        <Route element={<WhaleDashboardShell />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="insights" element={<InsightsOverviewPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
        </Route>

        {/* Editor */}
        <Route element={<EditorLayout />}>
          <Route path="editor/:id" element={<EditorPage />} />
        </Route>

        {/* Preview */}
        <Route path="preview/:id" element={<PreviewPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to={`/${preferredLocale()}/dashboard`} replace />} />
    </Routes>
  );
}
