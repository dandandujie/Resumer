import { useDroppable, useDraggable, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '@/stores/journal-store';
import { STATUS_KEY, statusTone } from '@/components/journal/journal-labels';

interface ApplicationKanbanProps {
  applications: Application[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onOpen: (id: string) => void;
}

function Column({
  status,
  applications,
  onOpen,
}: {
  status: ApplicationStatus;
  applications: Application[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('journal');
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`min-h-[300px] rounded-xl bg-[var(--whale-cream-soft)] p-2 ${isOver ? 'ring-2 ring-[var(--whale-ink)]/30' : ''}`}>
      <header className="flex items-center justify-between px-2 py-2">
        <h3 className="text-xs font-semibold text-[var(--whale-ink)]">{t(STATUS_KEY[status])}</h3>
        <span className="text-[11px] text-[var(--whale-ink-muted)]">{applications.length}</span>
      </header>
      <div className="space-y-2">
        {applications.map((application) => <Card key={application.id} application={application} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function Card({
  application,
  onOpen,
}: {
  application: Application;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: application.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onOpen(application.id)}
      className={`w-full cursor-grab rounded-lg border border-[var(--whale-divider)] bg-[var(--whale-card)] p-3 text-left shadow-sm active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="truncate text-xs font-semibold text-[var(--whale-ink)]">{application.company || '未命名公司'}</div>
      <div className="mt-1 truncate text-[11px] text-[var(--whale-ink-muted)]">{application.role || '未命名岗位'}</div>
      <span className={`mt-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${statusTone(application.status)}`}>
        {application.appliedDate || '未填日期'}
      </span>
    </button>
  );
}

export function ApplicationKanban({ applications, onStatusChange, onOpen }: ApplicationKanbanProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const target = event.over?.id;
    if (!target || !APPLICATION_STATUSES.includes(target as ApplicationStatus)) return;
    const application = applications.find((item) => item.id === event.active.id);
    if (application && application.status !== target) onStatusChange(application.id, target as ApplicationStatus);
  };
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid min-w-[980px] grid-cols-7 gap-3">
        {APPLICATION_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            applications={applications.filter((item) => item.status === status)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </DndContext>
  );
}
