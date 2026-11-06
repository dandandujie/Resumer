import { useDroppable, useDraggable, DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useLocale, useTranslations } from 'next-intl';
import { APPLICATION_STATUSES, nextInterview, isOverdue, type Application, type ApplicationStatus } from '@/stores/journal-store';
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
    <section ref={setNodeRef} className="application-kanban-column" data-drop-active={isOver}>
      <header className="flex items-center justify-between px-2 py-2">
        <h3 className="text-xs font-semibold text-[var(--app-text)]">{t(STATUS_KEY[status])}</h3>
        <span className={`text-[11px] tabular-nums ${applications.length ? statusTone(status) : 'text-[var(--app-text-muted)]'}`}>{applications.length}</span>
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
  const t = useTranslations('journal');
  const locale = useLocale();
  const next = nextInterview(application);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: application.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      data-kanban-app={application.id}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(application.id)}
      className="application-kanban-card" data-dragging={isDragging}
    >
      <div className="truncate text-xs font-semibold text-[var(--app-text)]">{application.company || t('kanbanNoCompany')}</div>
      <div className="mt-1 truncate text-[11px] text-[var(--app-text-muted)]">{application.role || t('kanbanNoRole')}</div>
      <span className="mt-2 inline-flex text-[11px] text-[var(--app-text-muted)]">
        {application.appliedDate || t('kanbanNoDate')}
      </span>
      {next ? <span className="mt-2 block border-t border-[var(--app-border)] pt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
        <span className="block font-medium">{next.round || t('stageInterview')} · {new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(next.scheduledAt!))}</span>
        {next.location && <span className="block break-words">{next.location}</span>}
      </span> : application.nextFollowUp && <span className={`mt-2 block border-t border-[var(--app-border)] pt-2 text-[11px] ${isOverdue(application) ? 'text-[var(--app-status-danger)]' : 'text-[var(--app-text-muted)]'}`}>{t('kanbanFollowUp', { date: application.nextFollowUp })}</span>}
    </button>
  );
}

export function ApplicationKanban({ applications, onStatusChange, onOpen }: ApplicationKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const handleDragEnd = (event: DragEndEvent) => {
    const target = event.over?.id;
    if (!target || !APPLICATION_STATUSES.includes(target as ApplicationStatus)) return;
    const application = applications.find((item) => item.id === event.active.id);
    if (application && application.status !== target) onStatusChange(application.id, target as ApplicationStatus);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[repeat(7,230px)] gap-3">
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
