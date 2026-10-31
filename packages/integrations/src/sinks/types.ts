/**
 * Data out ("event sinks"): QRdx scans and form responses delivered to a
 * connected tool. The app loads items after a cursor, a sink delivers them,
 * and the sync state (stored in integration.metadata.sync) records the
 * outcome. Client-safe types only.
 */

export const SINK_PROVIDERS = [
  "google-sheets",
  "hubspot",
  "mailchimp",
] as const;
export type SinkProviderSlug = (typeof SINK_PROVIDERS)[number];

export function isSinkProvider(slug: string): slug is SinkProviderSlug {
  return (SINK_PROVIDERS as readonly string[]).includes(slug);
}

/** What a sink stream carries. */
export type SinkStream = "scans" | "responses";

export const SINK_STREAMS: Record<SinkProviderSlug, SinkStream> = {
  "google-sheets": "scans",
  hubspot: "responses",
  mailchimp: "responses",
};

/** One scan as a row (no visitor hash, no IP: nothing identifies a person). */
export interface SinkScan {
  id: string;
  scannedAt: string;
  code: { id: string; slug: string; title: string | null };
  country: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
  language: string | null;
}

export type SinkAnswerValue = string | number | boolean | string[];

export interface SinkAnswer {
  /** Form field id */
  id: string;
  label: string;
  /** Form field type: text, email, phone, stars, nps, choice, consent */
  type: string;
  value: SinkAnswerValue;
  /** The answer as text (formatAnswerValue) */
  text: string;
}

export interface SinkFormResponse {
  id: string;
  createdAt: string;
  pageId: string;
  pageTitle: string | null;
  /** Form block id */
  formId: string;
  codeSlug: string | null;
  answers: SinkAnswer[];
}

/** Where the last delivered item sits (items are read in (time, id) order). */
export interface SyncCursor {
  at: string;
  id: string;
}

export type SyncStatus = "idle" | "ok" | "retrying" | "failed" | "paused";

/** integration.metadata.sync */
export interface SyncState {
  enabled: boolean;
  /** Workspace whose data is sent (null = personal) */
  organizationId: string | null;
  cursor: SyncCursor | null;
  /** Failed tries in a row */
  attempts: number;
  nextAttemptAt: string | null;
  /** A worker holds the stream until then (crash-safe lease) */
  leaseUntil: string | null;
  status: SyncStatus;
  /** Safe text: provider + code, never tokens or personal data */
  lastError: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  /** Totals since the stream was turned on */
  delivered: number;
  skipped: number;
}

export interface SinkDeliveryResult {
  /** Items the tool accepted */
  delivered: number;
  /** Items left out on purpose (no email, no consent, duplicate, invalid) */
  skipped: number;
  /** Advance to here; null = nothing was read */
  cursor: SyncCursor | null;
}
