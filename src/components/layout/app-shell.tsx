import { useCallback, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { BookOpenCheck, FileText, Library, LockKeyhole, NotebookPen, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BoundedOutlet } from './page-error-boundary';
import { Link, usePathname } from '@/i18n/routing';
import { useUIStore } from '@/stores/ui-store';
import { useDesignAttribute } from '@/hooks/use-design-attribute';
import { startWindowDrag } from '@/lib/window-drag';
import { APP_NAME } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { CreateResumeDialog } from '@/components/dashboard/create-resume-dialog';
import { ImportResumeDialog } from '@/components/import/import-resume-dialog';
import * as api from '@/lib/tauri-api';
import { listen } from '@tauri-apps/api/event';

export function AppShell() {
  useDesignAttribute('stats');
  const t = useTranslations('dashboard');
  const settings = useTranslations('settings');
  const zh = useLocale() === 'zh';
  const pathname = usePathname();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // A route can destroy its focused opener (e.g. editor → dashboard).
    // Give keyboard users a task landmark without stealing restored/input focus.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) mainRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);
  const navigate = useNavigate();
  const { activeModal, closeModal, openModal } = useUIStore();
  const prefix = location.pathname.split('/')[1] || 'zh';
  useEffect(() => { const stop = listen('open-experiences', () => navigate(`/${prefix}/work-notes`)); return () => { void stop.then(fn => fn()); }; }, [navigate, prefix]);
  const navigation = [
    { path: '/dashboard', label: t('title'), icon: FileText },
    { path: '/insights', label: t('journalTitle'), icon: BookOpenCheck },
    { path: '/knowledge', label: t('knowledgeNav'), icon: Library },
  ];
  const current = pathname.startsWith('/resume-workspace') ? { label: zh ? '定向改稿' : 'Tailoring workspace', icon: FileText } : pathname.startsWith('/work-notes') ? { label: zh ? '我的经历' : 'My experience', icon: NotebookPen } : navigation.find(item => pathname.startsWith(item.path));
  const handleCreate = useCallback(async (data: { title?: string; language?: string; template?: string }) => {
    const id = await api.createResume(data); return api.getResume(id);
  }, []);
  return <div data-design="stats" className="app-shell">
    <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-[100] h-5" aria-hidden onMouseDown={event => { if (event.button === 0) startWindowDrag(); }} />
    <aside className="app-sidebar" aria-label={zh ? '主导航' : 'Main navigation'}>
      <Link href="/dashboard" className="app-sidebar-brand"><img src="/logo-icon.svg" alt="" /><span>{APP_NAME}</span></Link>
      <p className="app-nav-caption">WORKSPACE</p>
      <nav className="space-y-1">{navigation.map(({ path, label, icon: Icon }) => <button key={path} className="app-nav-item" type="button" aria-current={(pathname.startsWith(path) || (path === '/dashboard' && pathname.startsWith('/resume-workspace'))) ? 'page' : undefined} onClick={() => navigate(`/${prefix}${path}`)}><Icon /><span>{label}</span></button>)}</nav>
      <div className="app-sidebar-bottom">
        <button type="button" className="app-nav-item" onClick={() => openModal('settings')}><Settings /><span>{settings('title')}</span></button>
        <div className="app-local-caption"><LockKeyhole className="size-3" /><span>{zh ? '本机保存 · 无需登录' : 'On this Mac · No account'}</span></div>
      </div>
    </aside>
    <div className="app-detail">
      <header data-tauri-drag-region className="app-titlebar">
        <span className="app-titlebar-title">{current && <current.icon className="size-3.5" />}{current?.label}</span>
        <div className="app-titlebar-actions"><span className="hidden text-[10px] sm:inline">{t('localBadge')}</span><Button size="icon-xs" variant="ghost" aria-label={settings('title')} onClick={() => openModal('settings')}><Settings /></Button></div>
      </header>
      <nav className="grid grid-cols-2 gap-1 border-b px-3 pb-2 md:hidden" aria-label={t('workspace')}>{navigation.map(({ path, label }) => <Link key={path} href={path} aria-current={(pathname === path || (path === '/dashboard' && pathname.startsWith('/resume-workspace'))) ? 'page' : undefined} className="app-nav-item justify-center">{label}</Link>)}</nav>
      <main ref={mainRef} tabIndex={-1} aria-label={current?.label} className={`min-h-0 flex-1 outline-none ${pathname.startsWith('/knowledge') ? 'overflow-hidden' : 'overflow-y-auto'}`}><BoundedOutlet /></main>
    </div>
    <SettingsDialog />
    <CreateResumeDialog open={activeModal === 'create-resume'} onClose={closeModal} onImport={() => openModal('import')} onCreate={handleCreate} />
    <ImportResumeDialog open={activeModal === 'import'} onOpenChange={open => open ? openModal('import') : closeModal()} />
  </div>;
}
