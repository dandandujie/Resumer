import { Outlet } from 'react-router-dom';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Settings,
  Languages,
  CheckCircle2,
  Github,
  Plus,
  Lock,
  BookOpenCheck,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { useNavigate, useLocation } from 'react-router-dom';
import { locales, localeNames } from '@/i18n/config';
import i18n from '@/i18n';
import { useUIStore } from '@/stores/ui-store';
import { useDesignAttribute } from '@/hooks/use-design-attribute';
import { cn } from '@/lib/utils';
import { startWindowDrag } from '@/lib/window-drag';
import { APP_NAME } from '@/lib/constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { CreateResumeDialog } from '@/components/dashboard/create-resume-dialog';
import { ImportResumeDialog } from '@/components/import/import-resume-dialog';
import * as api from '@/lib/tauri-api';

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/logo-icon.svg"
      alt={APP_NAME}
      className="inline-flex shrink-0 rounded-xl"
      style={{ height: size, width: size }}
    />
  );
}

function WhaleSidebar() {
  const { openModal } = useUIStore();
  const pathname = usePathname();
  const navigate = useNavigate();
  const { pathname: rawPathname } = useLocation();
  const t = useTranslations('dashboard');
  const tSettings = useTranslations('settings');
  const isDashboard = pathname === '/dashboard';
  const isInsights = pathname.startsWith('/insights');
  const isKnowledge = pathname.startsWith('/knowledge');

  const localePrefix = rawPathname.split('/')[1] || 'zh';
  const goTo = (path: string) => () => navigate(`/${localePrefix}${path}`);

  const items: { icon: typeof LayoutDashboard; label: string; onClick: () => void; active?: boolean }[] = [
    { icon: LayoutDashboard, label: t('nav'), onClick: goTo('/dashboard'), active: isDashboard },
    { icon: BookOpenCheck, label: t('journalTitle'), onClick: goTo('/insights'), active: isInsights },
    { icon: BookOpenCheck, label: '知识库', onClick: goTo('/knowledge'), active: isKnowledge },
    { icon: Settings, label: tSettings('title'), onClick: () => openModal('settings') },
  ];

  return (
    <aside className="hidden md:flex w-44 shrink-0 flex-col border-r border-[var(--whale-divider)] bg-[var(--whale-sidebar)]">
      {/* Top drag strip — covers the traffic-light row so the user can drag
          the window from the sidebar top, not only the topbar. */}
      <div data-tauri-drag-region className="h-12 w-full shrink-0" />
      <div className="flex flex-1 min-h-0 flex-col px-3 pb-5">
        <Link href="/dashboard" className="mb-7 flex items-center gap-2.5 px-2">
          <BrandMark size={28} />
          <span className="font-display text-[17px] font-semibold tracking-tight text-[var(--whale-ink)]">{APP_NAME}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map(({ icon: Icon, label, onClick, active }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer',
                active
                  ? 'bg-[var(--whale-ink)] text-[var(--whale-cream)] shadow-sm'
                  : 'text-[var(--whale-ink-soft)] hover:bg-[var(--whale-cream-deep)]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-4 rounded-xl border border-dashed border-[var(--whale-divider)] p-3 text-[11px] leading-relaxed text-[var(--whale-ink-muted)]">
          <p className="font-semibold text-[var(--whale-ink-soft)]">{t('tipTitle')}</p>
          <p className="mt-1">{t('tipBody')}</p>
        </div>
      </div>
    </aside>
  );
}

function WhaleLocaleSwitcher() {
  const locale = useLocale();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleChange(next: string) {
    i18n.changeLanguage(next);
    const parts = pathname.split('/');
    if (parts.length > 1 && locales.includes(parts[1] as any)) {
      parts[1] = next;
      navigate(parts.join('/'), { replace: true });
    } else {
      navigate(`/${next}${pathname}`, { replace: true });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-3 py-1.5 text-xs font-medium text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-deep)]">
        <Languages className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wider">{localeNames[locale as keyof typeof localeNames] || locale}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem key={loc} className="cursor-pointer" onClick={() => handleChange(loc)}>
            {localeNames[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WhaleTopBar() {
  const { openModal } = useUIStore();
  const t = useTranslations('dashboard');

  return (
    <header
      data-tauri-drag-region
      className="flex h-14 items-center justify-between border-b border-[var(--whale-divider)] bg-[var(--whale-cream)] px-4 md:px-6"
    >
      <div className="flex items-center gap-3 pl-20 md:hidden">
        <BrandMark size={28} />
        <span className="font-display text-[17px] font-semibold tracking-tight text-[var(--whale-ink)]">{APP_NAME}</span>
      </div>
      <div className="hidden md:flex items-center gap-2 rounded-full border border-[var(--whale-divider)] bg-[var(--whale-cream-soft)] px-3 py-1 text-[12px] text-[var(--whale-ink-soft)]">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--whale-mint)] text-[var(--whale-ink)]">
          <Lock className="h-3 w-3" />
        </span>
        <span className="font-semibold tracking-wider">{t('localBadge')}</span>
        <span className="text-[var(--whale-ink-muted)]">·</span>
        <span className="text-[var(--whale-ink-muted)]">{t('localSubtitle')}</span>
      </div>
      <div className="flex items-center gap-2">
        <WhaleLocaleSwitcher />
        <button
          type="button"
          onClick={() => openModal('create-resume')}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--whale-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--whale-cream)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{t('createResume')}</span>
        </button>
      </div>
    </header>
  );
}

function WhaleFooter() {
  const t = useTranslations('dashboard');
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--whale-divider)] bg-[var(--whale-cream)] px-4 py-3 text-[11px] text-[var(--whale-ink-muted)] md:px-6">
      <span>© {new Date().getFullYear()} {APP_NAME} · {t('footerRights')}</span>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--whale-mint)]/40 px-2.5 py-0.5 font-semibold text-[var(--whale-ink)]">
          <CheckCircle2 className="h-3 w-3" />
          {t('footerLocalFirst')}
        </span>
        <a
          href="https://github.com/dandandujie/Reseumer"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-[var(--whale-cream-deep)] px-2.5 py-0.5 font-semibold text-[var(--whale-ink-soft)] transition-colors hover:bg-[var(--whale-cream-soft)] hover:text-[var(--whale-ink)]"
        >
          <Github className="h-3 w-3" />
          {t('footerOpenSource')}
        </a>
      </div>
    </footer>
  );
}

export function WhaleDashboardShell() {
  useDesignAttribute('whale');
  const { activeModal, closeModal, openModal } = useUIStore();
  const location = useLocation();
  const targetResumeId = location.pathname.match(/\/editor\/([^/]+)/)?.[1];

  // 顶栏「新建简历」在工作台和求职动态页都可用；创建后由对话框自行跳转到编辑器。
  const handleCreateResume = useCallback(
    async (data: { title?: string; language?: string; template?: string }) => {
      const resumeId = await api.createResume(data);
      return api.getResume(resumeId);
    },
    []
  );

  return (
    <div data-design="whale" className="relative flex h-screen w-screen overflow-hidden bg-[var(--whale-cream)] text-[var(--whale-ink)]">
      <div
        data-tauri-drag-region
        className="fixed inset-x-0 top-0 z-[100] h-5 cursor-default"
        aria-hidden
        onMouseDown={(event) => {
          if (event.button === 0) startWindowDrag();
        }}
      />
      <WhaleSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <WhaleTopBar />
        <main className="whale-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
        <WhaleFooter />
      </div>
      {/* Global dialogs — accessible from all shell pages */}
      <SettingsDialog />
      <CreateResumeDialog
        open={activeModal === 'create-resume'}
        onClose={closeModal}
        onImport={() => openModal('import')}
        onCreate={handleCreateResume}
      />
      <ImportResumeDialog open={activeModal === 'import'} onOpenChange={(open) => open ? openModal('import') : closeModal()} targetResumeId={targetResumeId} />
    </div>
  );
}
