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

/** 状态胶囊配色：进行中中性、Offer 薄荷、关闭类偏红。 */
export function statusTone(status: ApplicationStatus): string {
  if (status === 'offer') return 'bg-[var(--whale-mint)]/40 text-[var(--whale-ink)]';
  if (status === 'rejected' || status === 'declined' || status === 'ghosted') return 'bg-red-50 text-red-700';
  if (status === 'interview') return 'bg-amber-50 text-amber-700';
  return 'bg-[var(--whale-cream-deep)] text-[var(--whale-ink-soft)]';
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
