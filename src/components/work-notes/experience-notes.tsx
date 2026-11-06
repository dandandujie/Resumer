import { ChoiceSelect } from '@/components/ui/choice-select';
import { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWorkNotes } from '@/hooks/use-work-notes';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { appendNoteMaterial } from '@/lib/work-notes';
import type { WorkExperienceItem } from '@/types/resume';
import * as noteApi from '@/lib/work-notes-api';
import type { WorkExperience } from '@/types/work-notes';
import { NoteRecall } from './note-recall';
export function ExperienceNotes({ sectionId, item }: { sectionId: string; item: WorkExperienceItem }) {
  const [before, setBefore] = useState<WorkExperienceItem | null>(null);
  const settings = useUIStore(s => s.activeModal === 'settings');
  const resumeId = useResumeStore(s => s.currentResume?.id);
  return <>
    <Button variant="outline" size="xs" onClick={() => setBefore(structuredClone(item))}><NotebookPen />从随记补充</Button>
    <Dialog open={!!before && !settings} onOpenChange={open => { if (!open) setBefore(null); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader><DialogTitle>从工作随记里找素材</DialogTitle><DialogDescription>补充到 {item.company || '这段经历'} · {item.position || '工作经历'}。先对照原话，再选择想讲的部分。</DialogDescription></DialogHeader>
        {before && resumeId && <ExperienceRecall key={`${resumeId}:${sectionId}:${item.id}`} resumeId={resumeId} sectionId={sectionId} before={before} />}
      </DialogContent>
    </Dialog>
  </>;
}
function ExperienceRecall({ resumeId, sectionId, before }: { resumeId: string; sectionId: string; before: WorkExperienceItem }) {
  const notes = useWorkNotes();
  const [experiences,setExperiences]=useState<WorkExperience[]>([]),[experienceId,setExperienceId]=useState(''),[loadError,setLoadError]=useState('');
  useEffect(()=>{let active=true;void noteApi.listExperiences().then(items=>{if(active)setExperiences(items);}).catch(e=>{if(active)setLoadError(String(e.message||e));});return()=>{active=false;};},[]);
  if (!notes.contexts.length && notes.error) return <p role="alert">{notes.error}</p>;
  return <div className="min-h-0 overflow-y-auto pr-1">{loadError&&<p role="alert" className="mb-3 text-xs text-destructive">{loadError}</p>}
    <label className="mb-4 block space-y-2 text-xs">从哪段已记录的经历里找？<ChoiceSelect aria-label="选择素材来源经历" className="h-9 w-full rounded-md border bg-[var(--app-field)] px-3" value={experienceId} onChange={e=>setExperienceId(e.target.value)}><option value="">请核对后选择经历</option>{experiences.map(e=><option key={e.id} value={e.id}>{e.company} · {e.position} · {e.startedOn}</option>)}</ChoiceSelect></label>
    {!experiences.length&&<p className="text-xs text-muted-foreground">还没有已归组的工作片段。可以先在“我的经历”开始记录。</p>}
    {!!experienceId&&<NoteRecall key={experienceId} experienceId={experienceId} targetLabel={[before.company, before.position].filter(Boolean).join(' · ') || '当前工作经历'} slot={`experience:${resumeId}:${sectionId}:${before.id}:${experienceId}`} {...notes} onAnalyze={notes.analyze} onApply={(routine, events) => {
      const state = useResumeStore.getState();
      if (state.currentResume?.id !== resumeId) throw Error('已切换简历，请重新打开素材');
      const content = appendNoteMaterial(state.sections, sectionId, before, routine, events);
      useEditorStore.getState().pushSnapshot(state.sections);
      state.updateSection(sectionId, content);
      toast.success('已补入简历草稿，可撤销；核对后记得保存');
    }} />}
  </div>;
}
