/**
 * Compatibility layer for next-intl.
 * All 55+ files importing { useTranslations } from 'next-intl'
 * are automatically redirected here via Vite alias.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './index';

/** 返回的 t 在语言不变时引用稳定，可以安全地放进 useMemo/useCallback 依赖。 */
export function useTranslations(namespace?: string) {
  const { t } = useTranslation();
  return useCallback(
    (key: string, params?: Record<string, unknown>) =>
      t(namespace ? `${namespace}.${key}` : key, params as any) as string,
    [t, namespace],
  );
}

export function useLocale(): string {
  return i18n.language?.split('-')[0] || 'zh';
}

export function useMessages() {
  return i18n.getResourceBundle(i18n.language, 'translation') || {};
}

export function useNow() {
  return new Date();
}

export function useTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// NextIntlClientProvider is a no-op in the Vite build
// (i18next is initialized globally in src/i18n/index.ts)
export function NextIntlClientProvider({ children }: { children: React.ReactNode }) {
  return children;
}
