import type { Application, ApplicationStatus } from '@/stores/journal-store';

type StatusGroup = 'waiting' | 'interview' | 'offer' | 'closed';
const GROUP: Record<ApplicationStatus, StatusGroup> = {
  submitted: 'waiting', screening: 'waiting', interview: 'interview', offer: 'offer',
  rejected: 'closed', declined: 'closed', ghosted: 'closed',
};

export function applicationStatusSummary(applications: ReadonlyArray<Pick<Application, 'status'>>) {
  const counts: Record<StatusGroup, number> = { waiting: 0, interview: 0, offer: 0, closed: 0 };
  for (const application of applications) counts[GROUP[application.status]]++;
  return counts;
}
