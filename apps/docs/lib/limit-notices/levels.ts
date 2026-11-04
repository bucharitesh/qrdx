// Plan-limit emails (the Dub study's gap 14): which limits send one, when,
// and the words they use. Pure, so the tests cover every case.

import { type MeterId, meterLevel } from "@/app/settings/usage/_lib/meters";

/** The capped limits in lib/plans.ts that send a notice near and at the cap. */
export const NOTICE_LIMITS = [
  "dynamicCodes",
  "landingPages",
  "savedThemes",
  "storage",
  "aiArt",
  "formResponses",
] as const satisfies readonly MeterId[];

export type NoticeLimitId = (typeof NOTICE_LIMITS)[number];

/** Percent of the limit: 90 ("almost full") and 100 ("limit reached"). */
export type NoticeThreshold = 90 | 100;

/**
 * The period a notice is sent once in: the calendar month (UTC), the same
 * window the monthly allowances (AI art, form responses) reset on.
 */
export function noticePeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Thresholds reached at this usage, lowest first: none below 90% or
 * without a cap (null, or 0 = not on the plan), [90] from 90%, and
 * [90, 100] at or over the limit (90 is then claimed too, so a later
 * "almost full" never follows a "limit reached" in the same month).
 */
export function reachedThresholds(
  used: number,
  limit: number | null,
): NoticeThreshold[] {
  const level = meterLevel({ used, limit });
  if (level === "full") return [90, 100];
  if (level === "near") return [90];
  return [];
}

/** How each limit is named in a notice. */
export const NOTICE_WORDS: Record<
  NoticeLimitId,
  { label: string; noun: string }
> = {
  dynamicCodes: { label: "Dynamic QR codes", noun: "dynamic QR codes" },
  landingPages: { label: "Hosted pages", noun: "hosted pages" },
  savedThemes: { label: "Saved themes", noun: "saved themes" },
  storage: { label: "File storage", noun: "file storage" },
  aiArt: { label: "AI art images", noun: "AI art images" },
  formResponses: { label: "Form responses", noun: "form responses" },
};

/** "Dynamic QR codes: 9 of 10 used in Acme" / "…: limit reached in Acme". */
export function noticeSubject(
  id: NoticeLimitId,
  threshold: NoticeThreshold,
  { value, workspace }: { value: string; workspace: string },
): string {
  const { label } = NOTICE_WORDS[id];
  return threshold === 100
    ? `${label}: limit reached in ${workspace}`
    : `${label}: ${value} used in ${workspace}`;
}

/** Resend idempotency key: one email per notice, even if a send is retried. */
export function noticeKey(parts: {
  organizationId: string;
  limitId: NoticeLimitId;
  subject: string;
  period: string;
  threshold: NoticeThreshold;
}): string {
  return [
    "limit-notice",
    parts.organizationId,
    parts.limitId,
    parts.subject || "workspace",
    parts.period,
    parts.threshold,
  ].join(":");
}
