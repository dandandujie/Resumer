import { useLayoutEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

/** HTML 是 portal 与页面共同的设计变量所有者；切换外观不能卸载设计体系。 */
export function useDesignAttribute(value: string) {
  const theme = useUIStore(state => state.theme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-design');
    root.setAttribute('data-design', value);
    return () => {
      if (previous === null) root.removeAttribute('data-design');
      else root.setAttribute('data-design', previous);
    };
  }, [value]);

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute(
      'data-appearance', theme === 'system' ? media.matches ? 'dark' : 'light' : theme,
    );
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
