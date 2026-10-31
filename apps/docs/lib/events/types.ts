// Client-safe event catalog: shared by the emitter (lib/events/emit.ts), the
// webhooks dashboard, the notification settings and the REST hooks API.

/** Events a webhook endpoint (or Zapier/Make hook) can subscribe to. */
export const WEBHOOK_EVENTS = [
  "scan.created",
  "scan.milestone",
  "code.created",
  "code.updated",
  "form.submitted",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Everything emitEvent() accepts. */
export type EventType = WebhookEvent;

/** Sent only by "Send test" in the dashboard. */
export const PING_EVENT = "ping";

/** Events an email / Slack / Discord target can be notified about. */
export const NOTIFICATION_EVENTS = [
  "digest.weekly",
  "scan.milestone",
  "form.submitted",
  "code.created",
  "code.updated",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** The weekly digest is an email; chat targets get the per-event alerts. */
export const CHAT_NOTIFICATION_EVENTS: readonly NotificationEvent[] =
  NOTIFICATION_EVENTS.filter((event) => event !== "digest.weekly");

export const NOTIFICATION_CHANNEL_LABELS = {
  email: "Email",
  slack: "Slack",
  discord: "Discord",
} as const;

export const EVENT_INFO: Record<
  WebhookEvent | NotificationEvent,
  { label: string; description: string }
> = {
  "scan.created": {
    label: "Scans",
    description:
      "Scans of your dynamic codes, batched: one delivery per minute with up to 100 scans and the exact count.",
  },
  "scan.milestone": {
    label: "Scan milestones",
    description:
      "A code's first scan, then 10, 100, 500, 1,000, 5,000, 10,000 scans and beyond.",
  },
  "code.created": {
    label: "New codes",
    description: "A dynamic code was created.",
  },
  "code.updated": {
    label: "Code changes",
    description: "A code's destination, title, design or domain changed.",
  },
  "form.submitted": {
    label: "Form submissions",
    description: "Someone submitted a form on one of your hosted pages.",
  },
  "digest.weekly": {
    label: "Weekly digest",
    description:
      "Monday email with last week's scans, top codes and form responses.",
  },
};

export const isWebhookEvent = (value: unknown): value is WebhookEvent =>
  typeof value === "string" &&
  (WEBHOOK_EVENTS as readonly string[]).includes(value);

export const isNotificationEvent = (
  value: unknown,
): value is NotificationEvent =>
  typeof value === "string" &&
  (NOTIFICATION_EVENTS as readonly string[]).includes(value);

/** Scan counts that emit scan.milestone (1 = the first scan). */
export const SCAN_MILESTONES = [
  1, 10, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
] as const;

/** Every 1,000,000 scans after the listed milestones. */
export function isScanMilestone(count: number): boolean {
  if (!Number.isInteger(count) || count < 1) return false;
  if ((SCAN_MILESTONES as readonly number[]).includes(count)) return true;
  return count > 1_000_000 && count % 1_000_000 === 0;
}

/** Scan batching for scan.created deliveries. */
export const SCAN_BATCH_WINDOW_SECONDS = 60;
export const SCAN_BATCH_MAX_SCANS = 100;

/** Automatic attempts per delivery (the first one included). */
export const MAX_DELIVERY_ATTEMPTS = 8;

/** Webhook endpoints per workspace. */
export const MAX_WEBHOOK_ENDPOINTS = 20;

/** Slack / Discord targets per person and workspace. */
export const MAX_CHAT_TARGETS = 10;

export const WEBHOOK_SIGNATURE_HEADER = "X-QRdx-Signature";
export const WEBHOOK_EVENT_HEADER = "X-QRdx-Event";
export const WEBHOOK_DELIVERY_HEADER = "X-QRdx-Delivery";
export const WEBHOOK_TIMESTAMP_HEADER = "X-QRdx-Timestamp";

export type DeliveryStatus = "pending" | "succeeded" | "failed";

/** JSON body of every webhook delivery. */
export interface WebhookEnvelope<T = Record<string, unknown>> {
  /** Unique per event (one scan batch = one event) */
  id: string;
  type: WebhookEvent | typeof PING_EVENT;
  created_at: string;
  data: T;
}

export interface CodeSummary {
  id: string;
  slug: string;
  title: string | null;
  short_link: string;
  destination_url: string;
  status: string;
  scan_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScanSummary {
  scan_id: string;
  code: { id: string; slug: string; title: string | null };
  scanned_at: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
}

export interface ScanBatchData {
  window_started_at: string;
  window_seconds: number;
  /** Scans in the window; may exceed scans.length */
  count: number;
  /** The first SCAN_BATCH_MAX_SCANS scans of the window */
  scans: ScanSummary[];
}

export interface ScanMilestoneData {
  milestone: number;
  code: { id: string; slug: string; title: string | null; scan_count: number };
  scan: ScanSummary;
}

export interface CodeEventData {
  code: CodeSummary;
  /** code.updated: snake_case names of the changed fields */
  changes?: string[];
  /** Who made the change (user id) */
  actor_id: string | null;
}

export interface FormField {
  name: string;
  label: string;
  value: string;
}

export interface FormSubmittedData {
  response_id: string;
  page: { id: string; title: string | null };
  code: { id: string; slug: string } | null;
  fields: FormField[];
  submitted_at: string;
}

export interface EventDataMap {
  "scan.created": ScanSummary;
  "scan.milestone": ScanMilestoneData;
  "code.created": CodeEventData;
  "code.updated": CodeEventData;
  "form.submitted": FormSubmittedData;
}
