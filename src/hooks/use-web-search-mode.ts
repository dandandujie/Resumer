import { useCallback, useState } from 'react';
import type { WebSearchMode } from '@/stores/settings-store';

/**
 * Per-surface web-search toggle. The resume AI assistant and the global agent
 * each own an independent enable/mode choice (persisted separately) so one does
 * not disturb the other. Search-tool *credentials* still live in Settings; only
 * the "on/off + which mode" lives here.
 */
export type WebSearchScope = 'project' | 'global';

const VALID: WebSearchMode[] = [
  'off',
  'native',
  'free',
  'bing',
  'google',
  'baidu',
  'tavily',
  'grok',
];

/** Default to the model's own built-in search ("模型自带") when the user hasn't chosen. */
function normalize(v: string | null): WebSearchMode {
  if (v === null) return 'native';
  return VALID.includes(v as WebSearchMode) ? (v as WebSearchMode) : 'native';
}

function storageKey(scope: WebSearchScope) {
  return `jade_web_search_mode:${scope}`;
}

export function useWebSearchMode(scope: WebSearchScope) {
  const key = storageKey(scope);
  const [mode, setModeState] = useState<WebSearchMode>(() => {
    if (typeof window === 'undefined') return 'off';
    // Fall back to the legacy global key so existing users keep their choice.
    return normalize(
      localStorage.getItem(key) ?? localStorage.getItem('jade_web_search_mode'),
    );
  });

  const setMode = useCallback(
    (next: WebSearchMode) => {
      setModeState(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* ignore */
      }
    },
    [key],
  );

  return [mode, setMode] as const;
}
