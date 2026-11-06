import { ChoiceSelect } from '@/components/ui/choice-select';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUIStore } from '@/stores/ui-store';
import { useWorkNotes } from '@/hooks/use-work-notes';
import * as api from '@/lib/work-notes-api';
import { Link } from '@/i18n/routing';
import type { WorkExperience, WorkNote } from '@/types/work-notes';
import { NoteComposer } from './note-composer';
export function QuickNoteDialog() {
  const activeModal = useUIStore(s => s.activeModal);
  const location = useLocation();
  const onNotesPage = location.pathname.endsWith('/work-notes');
  useEffect(() => { if (activeModal === 'work-note' && onNotesPage) { useUIStore.getState().closeModal(); document.getElementById('work-note-body')?.focus(); } }, [activeModal, onNotesPage]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'j' && !event.isComposing) {
        const state = useUIStore.getState();
        if (state.activeModal && state.activeModal !== 'work-note') return;
        event.preventDefault(); state.openModal('work-note');
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  return <Dialog open={activeModal === 'work-note' && !onNotesPage} onOpenChange={open => { if (!open) useUIStore.getState().closeModal(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>随手记</DialogTitle><DialogDescription>先把想到的留下来，它会留在当前工作经历里。</DialogDescription></DialogHeader><QuickComposer /></DialogContent></Dialog>;
}
function QuickComposer() {
  const notes = useWorkNotes();
  const [experiences,setExperiences]=useState<WorkExperience[]>([]),[experienceId,setExperienceId]=useState(''),[loadError,setLoadError]=useState('');
  useEffect(()=>{let active=true;void api.listExperiences().then(items=>{if(active){setExperiences(items);const lastId=localStorage.getItem('resumer_active_experience');setExperienceId(items.some(e=>e.id===lastId&&e.current)?lastId!:items.filter(e=>e.current).length===1?items.find(e=>e.current)!.id:'');}}).catch(e=>{if(active)setLoadError(String(e.message||e));});return()=>{active=false;};},[]);
  const experience=experiences.find(e=>e.id===experienceId);
  const [last, setLast] = useState<WorkNote | null>(null);
  return <>{loadError&&<p role="alert" className="text-xs text-destructive">{loadError}</p>}{!experiences.length?<p className="text-sm text-muted-foreground">先开始一段工作或实习，之后记下的事都会归到那里。<Link href="/work-notes" className="ml-2 underline" onClick={()=>useUIStore.getState().closeModal()}>开始我的经历</Link></p>:<label className="mb-3 block space-y-2 text-xs">这段话属于哪段经历？<ChoiceSelect className="h-9 w-full rounded-md border bg-[var(--app-field)] px-3" value={experienceId} onChange={e=>{setExperienceId(e.target.value);localStorage.setItem('resumer_active_experience',e.target.value);}}><option value="">选择工作或实习</option>{experiences.map(e=><option key={e.id} value={e.id}>{e.company} · {e.position}</option>)}</ChoiceSelect></label>}{experience&&<NoteComposer key={experience.id} experience={experience} contexts={notes.contexts} onSaved={note => { setLast(note); notes.refresh(); }} onAnalyze={notes.analyze} />}{last && <p role="status" className="text-xs text-muted-foreground">{notes.pending[last.id] ? '原话已保存，整理会继续。可以关掉这里，接着做刚才的事。' : notes.errors[last.id] ? '原话已保存，AI 暂时没能整理，之后可以再聊。' : '已留在这段经历里，随时能找回来。'}</p>}</>;
}
