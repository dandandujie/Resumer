import assert from 'node:assert/strict';
import { applicationStatusSummary } from '../src/lib/application-status-summary';

assert.deepEqual(applicationStatusSummary([]), { waiting: 0, interview: 0, offer: 0, closed: 0 });
const applications = [
  { status: 'submitted', outcome: { result: 'offer' } },
  { status: 'screening', interviews: [{ id: 'interview-1' }] },
  { status: 'interview' }, { status: 'offer' }, { status: 'rejected' },
  { status: 'declined' }, { status: 'ghosted' },
] satisfies Parameters<typeof applicationStatusSummary>[0] & Array<{ outcome?: { result: string }; interviews?: { id: string }[] }>;
const summary = applicationStatusSummary(applications);
assert.deepEqual(summary, { waiting: 2, interview: 1, offer: 1, closed: 3 });
assert.equal(Object.values(summary).reduce((total, count) => total + count, 0), applications.length);
assert.deepEqual(applicationStatusSummary([{ status: 'offer' }, { status: 'offer' }]), { waiting: 0, interview: 0, offer: 2, closed: 0 });
console.log('PASS application status chart counts each current status once, independently of outcomes and interview history');
