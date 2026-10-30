export type ApplicationStatus =
  | "submitted"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "declined"
  | "ghosted";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "submitted",
  "screening",
  "interview",
  "offer",
  "rejected",
  "declined",
  "ghosted",
];

/** 还在进行中的状态：待跟进 / 逾期提醒只针对它们。 */
export const OPEN_STATUSES: ApplicationStatus[] = [
  "submitted",
  "screening",
  "interview",
];

export type InterviewFormat =
  | "phone"
  | "video"
  | "onsite"
  | "take-home"
  | "other";
export const INTERVIEW_FORMATS: InterviewFormat[] = [
  "phone",
  "video",
  "onsite",
  "take-home",
  "other",
];

export type OutcomeResult = "offer" | "rejected" | "withdrew" | "ghosted";
export const OUTCOME_RESULTS: OutcomeResult[] = [
  "offer",
  "rejected",
  "withdrew",
  "ghosted",
];
