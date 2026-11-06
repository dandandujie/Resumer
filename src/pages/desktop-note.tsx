import { useCallback, useEffect, useRef, useState } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceSelect } from '@/components/ui/choice-select';
import { NoteComposer } from '@/components/work-notes/note-composer';
import { useWorkNotes } from '@/hooks/use-work-notes';
import { useDesignAttribute } from '@/hooks/use-design-attribute';
import { startWindowDrag } from '@/lib/window-drag';
import * as api from '@/lib/note-reminder-api';
import { invoke, isTauri } from '@tauri-apps/api/core';
import '@/styles/desktop-note.css';
import { listExperiences } from '@/lib/work-notes-api';
import type { WorkExperience } from '@/types/work-notes';

export default function DesktopNotePage() {
  useDesignAttribute('stats');
  const notes = useWorkNotes();
  const header = useRef<HTMLElement>(null), content = useRef<HTMLDivElement>(null);
  const [experiences, setExperiences] = useState<WorkExperience[]>([]);
  const [experienceId, setExperienceId] = useState(() => localStorage.getItem('resumer_desktop_experience') || '');
  const experience = experiences.find(item => item.id === experienceId) || experiences.find(item => item.current) || experiences[0];
  const [enabled, setEnabled] = useState(false), [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api.getNoteReminder().then(v => { if (active) setEnabled(v.config.enabled); }).catch(e => { if (active) setError(String(e.message || e)); });
      void listExperiences().then(v => { if (active) setExperiences(v); }).catch(e => { if (active) setError(String(e.message || e)); });
    };
    refresh();
    const stops = [listen('note-reminder-changed', refresh), listen('desktop-note-shown', () => {
      refresh(); window.dispatchEvent(new Event('focus'));
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector('[data-desktop-note]')?.animate([{ opacity: 0, transform: 'translateY(4px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 160, easing: 'cubic-bezier(.2,.7,.3,1)' });
    })];
    return () => { active = false; for (const stop of stops) void stop.then(fn => fn()); };
  }, []);
  const dismiss = useCallback(async (action: 'close' | 'skip' | 'snooze' | 'saved') => {
    setClosing(true); setError('');
    try {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 110));
      await api.dismissNoteReminder(action);
    }
    catch (e) { setError(`${action === 'saved' ? '原话已保存，' : ''}小窗未能收起：${String((e as Error).message || e)}`); }
    finally { setClosing(false); }
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) { event.preventDefault(); void dismiss('close'); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [dismiss]);
  useEffect(() => {
    if (!isTauri()) return;
    let timer: ReturnType<typeof setTimeout>;
    let lastHeight = 0;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const height = Math.min(520, Math.max(188, Math.ceil((header.current?.offsetHeight || 37) + (content.current?.scrollHeight || 129) + 22)));
        if (height !== lastHeight) { lastHeight = height; void invoke('note_reminder_resize', { height }).catch(() => { /* Browser mocks do not resize native windows. */ }); }
      }, 40);
    };
    const observer = new ResizeObserver(resize);
    if (content.current) observer.observe(content.current);
    const mutation = new MutationObserver(resize);
    if (content.current) mutation.observe(content.current, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', resize); resize();
    return () => { clearTimeout(timer); observer.disconnect(); mutation.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  return <main data-desktop-note data-closing={closing} className="desktop-note">
    <div className="desktop-note-surface">
      <header ref={header} className="desktop-note-header">
        <div className="desktop-note-identity" data-tauri-drag-region onMouseDown={e => { if (e.button === 0) startWindowDrag(); }}>
          <span className="desktop-note-friend" aria-hidden><span className="desktop-note-mouth" /></span><strong>留一点今天</strong>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="收起，保留草稿" title="收起，保留草稿（Esc）" disabled={closing} onClick={() => void dismiss('close')}><X /></Button>
      </header>
      <div ref={content} className="desktop-note-body">
        {experience ? <NoteComposer key={experience.id} experience={experience} contexts={notes.contexts} onSaved={() => dismiss('saved')} onAnalyze={notes.analyze} desktop desktopOptions={<>
          {experiences.length > 1 && <label className="desktop-note-experience"><ChoiceSelect aria-label="记录到哪段经历" value={experience.id} onChange={event => { setExperienceId(event.target.value); localStorage.setItem('resumer_desktop_experience', event.target.value); }}>{experiences.map(item => <option key={item.id} value={item.id}>{item.company} · {item.position}</option>)}</ChoiceSelect></label>}
          <div className="desktop-note-later">{enabled && <Button variant="ghost" size="xs" disabled={closing} onClick={() => void dismiss('snooze')}>15 分钟后</Button>}<Button variant="ghost" size="xs" disabled={closing} onClick={() => void dismiss('skip')}>今天先不了</Button></div>
        </>} /> : <div className="desktop-note-empty"><h1>从一段经历开始</h1><p>给工作里的小事，一个落脚处。</p><Button size="sm" onClick={() => { void invoke('show_main_window').then(() => emit('open-experiences')).then(() => dismiss('close')).catch(e => setError(String(e.message || e))); }}>去添加工作 / 实习</Button></div>}
        {error && <p role="alert" className="desktop-note-error">{error}</p>}
        {notes.error && <p role="alert" className="desktop-note-error">{notes.error}</p>}
      </div>
    </div>
  </main>;
}
