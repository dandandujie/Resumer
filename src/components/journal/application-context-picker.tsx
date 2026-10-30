import { useJournalStore, type Application } from '@/stores/journal-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** 用户明确选择上下文，避免把最近一次投递误当成这次的目标。 */
export function ApplicationContextPicker({ resumeId, value, onChoose }: { resumeId: string; value: string | null; onChoose: (application: Application) => void }) {
  const applications = useJournalStore(s => s.applications);
  const matching = applications.filter(a => a.resumeId === resumeId);
  if (!matching.length) return null;
  return <label className="block space-y-2 text-xs text-muted-foreground">从已有投递带入，不必重新填写
    <Select value={value || '__none__'} onValueChange={id => { const application = matching.find(a => a.id === id); if (application) onChoose(application); }}>
      <SelectTrigger className="w-full"><SelectValue placeholder="选择一条投递记录（可选）" /></SelectTrigger>
      <SelectContent><SelectItem value="__none__" disabled>选择一条投递记录（可选）</SelectItem>{matching.map(a => <SelectItem key={a.id} value={a.id}>{[a.company, a.role].filter(Boolean).join(' · ') || '尚未命名的投递'}</SelectItem>)}</SelectContent>
    </Select>
  </label>;
}
