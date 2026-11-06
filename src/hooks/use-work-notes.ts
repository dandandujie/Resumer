import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/work-notes-api';
import { isAIConfigured } from '@/lib/tauri-api';
import { useUIStore } from '@/stores/ui-store';
import type { WorkNote } from '@/types/work-notes';
import { listen } from '@tauri-apps/api/event';
export function useWorkNotes() {
  const [contexts, setContexts] = useState<string[]>([]), [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<Record<string, boolean>>({}), [errors, setErrors] = useState<Record<string, string>>(api.noteAnalysisErrors);
  const [error, setError] = useState('');
  const running = useRef(new Set<string>());
  useEffect(() => { let active = true; void api.noteContexts().then(v => { if (active) setContexts(v); }).catch(e => { if (active) setError(String(e.message || e)); }); return () => { active = false; }; }, [revision]);
  const refresh = useCallback(() => setRevision(r => r + 1), []);
  useEffect(() => {
    let active = true;
    const changed = () => { if (active) { refresh(); setErrors(api.noteAnalysisErrors()); } };
    const stop = listen('work-notes-changed', changed);
    window.addEventListener('work-notes-changed', changed);
    window.addEventListener('focus', changed);
    return () => { active = false; void stop.then(fn => fn()); window.removeEventListener('work-notes-changed', changed); window.removeEventListener('focus', changed); };
  }, [refresh]);
  const analyze = useCallback(async (note: WorkNote) => {
    if (!isAIConfigured()) { useUIStore.getState().setSettingsTab('ai'); useUIStore.getState().openModal('settings'); return; }
    if (running.current.has(note.id)) return;
    running.current.add(note.id); setPending(p => ({ ...p, [note.id]: true })); setErrors(e => ({ ...e, [note.id]: '' }));
    try { await api.analyzeNote(note.id); refresh(); }
    catch (e) { setErrors(old => ({ ...old, [note.id]: (e as Error).message || String(e) })); }
    finally { running.current.delete(note.id); setPending(p => ({ ...p, [note.id]: false })); }
  }, [refresh]);
  return { contexts, revision, pending, errors, error, refresh, analyze };
}
