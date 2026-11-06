import type { ApplicationStatus, InterviewFormat, OutcomeResult } from '@/stores/journal-store';

/** 状态 / 形式 / 结果 到 journal 命名空间文案 key 的映射，几个页面共用。 */
export const STATUS_KEY: Record<ApplicationStatus, string> = {
  submitted: 'statusSubmitted',
  screening: 'statusScreening',
  interview: 'statusInterview',
  offer: 'statusOffer',
  rejected: 'statusRejected',
  declined: 'statusDeclined',
  ghosted: 'statusGhosted',
};

export const FORMAT_KEY: Record<InterviewFormat, string> = {
  phone: 'formatPhone',
  video: 'formatVideo',
  onsite: 'formatOnsite',
  'take-home': 'formatTakeHome',
  other: 'formatOther',
};

export const OUTCOME_KEY: Record<OutcomeResult, string> = {
  offer: 'outcomeOffer',
  rejected: 'outcomeRejected',
  withdrew: 'outcomeWithdrew',
  ghosted: 'outcomeGhosted',
};

const STATUS_TONE: Record<ApplicationStatus, string> = {
  submitted: 'text-[var(--app-text-secondary)]',
  screening: 'text-[var(--app-status-warning)]',
  interview: 'text-[var(--app-status-warning)]',
  offer: 'text-[var(--app-status-success)]',
  rejected: 'text-[var(--app-text-muted)]',
  declined: 'text-[var(--app-text-muted)]',
  ghosted: 'text-[var(--app-text-muted)]',
};

export function statusTone(status: ApplicationStatus): string {
  return STATUS_TONE[status];
}

export function formatDateTime(value: string | undefined, locale: string): string {
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatUnixSeconds(secs: number, locale: string): string {
  return new Date(secs * 1000).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
