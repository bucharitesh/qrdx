/** Client-safe constants shared by the public report form and the admin queue. */

export const ABUSE_REASONS = [
  { value: "phishing", label: "Phishing or fake login page" },
  { value: "scam", label: "Scam or fraud" },
  { value: "malware", label: "Malware or harmful download" },
  { value: "adult", label: "Adult content" },
  { value: "illegal", label: "Illegal goods or services" },
  { value: "copyright", label: "Copyright or trademark infringement" },
  { value: "hate", label: "Hate speech or violent extremism" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;

export type PublicAbuseReason = (typeof ABUSE_REASONS)[number]["value"];

/** Reports filed by QRdx's own checks instead of a person. */
export const AUTOMATED_REASONS = {
  "auto-hold": "Held for review (automated check)",
  "auto-threat": "Flagged by Google Web Risk",
} as const;

export type AutomatedAbuseReason = keyof typeof AUTOMATED_REASONS;

export const ABUSE_REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type AbuseReportStatus = (typeof ABUSE_REPORT_STATUSES)[number];

export function abuseReasonLabel(reason: string): string {
  return (
    ABUSE_REASONS.find((item) => item.value === reason)?.label ??
    AUTOMATED_REASONS[reason as AutomatedAbuseReason] ??
    reason
  );
}
