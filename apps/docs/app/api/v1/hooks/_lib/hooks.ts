import "server-only";

import { database as db, qrCode, qrScan } from "@repo/database";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { codeSummary, scanSummary } from "@/lib/events/emit";
import type { WebhookEndpointView } from "@/lib/events/endpoints";
import { webhookUrlSchema } from "@/lib/events/endpoints";
import {
  type EventDataMap,
  SCAN_BATCH_WINDOW_SECONDS,
  type ScanBatchData,
  WEBHOOK_EVENTS,
  type WebhookEnvelope,
  type WebhookEvent,
} from "@/lib/events/types";
import type { ActiveScope } from "@/lib/scope";
import { shortLinkUrl } from "@/lib/short-links";

/**
 * REST Hooks subscribe body. Zapier sends `hookUrl` by default; Make and
 * custom clients may send `target_url` or `url`. One event or several.
 */
export const subscribeSchema = z
  .object({
    target_url: z.string().optional(),
    targetUrl: z.string().optional(),
    hookUrl: z.string().optional(),
    hook_url: z.string().optional(),
    url: z.string().optional(),
    event: z.enum(WEBHOOK_EVENTS).optional(),
    events: z
      .array(z.enum(WEBHOOK_EVENTS))
      .min(1)
      .max(WEBHOOK_EVENTS.length)
      .optional(),
  })
  .transform((body, ctx) => {
    const target =
      body.target_url ??
      body.targetUrl ??
      body.hookUrl ??
      body.hook_url ??
      body.url;
    const events = [
      ...new Set([...(body.events ?? []), ...(body.event ? [body.event] : [])]),
    ];
    if (!target) {
      ctx.addIssue({
        code: "custom",
        path: ["target_url"],
        message: "target_url is required",
      });
      return z.NEVER;
    }
    if (events.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["event"],
        message: `event must be one of ${WEBHOOK_EVENTS.join(", ")}`,
      });
      return z.NEVER;
    }
    const url = webhookUrlSchema.safeParse(target);
    if (!url.success) {
      ctx.addIssue({
        code: "custom",
        path: ["target_url"],
        message: url.error.issues[0]?.message ?? "Invalid URL",
      });
      return z.NEVER;
    }
    return { url: url.data, events };
  });

export function serializeHook(endpoint: WebhookEndpointView) {
  return {
    id: endpoint.id,
    target_url: endpoint.url,
    events: endpoint.events,
    // Zapier/Make expect a single event per subscription
    event: endpoint.events.length === 1 ? endpoint.events[0] : null,
    active: endpoint.active,
    created_at: endpoint.createdAt.toISOString(),
  };
}

function codeScope(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

const SAMPLE_TIME = "2026-01-05T09:30:00.000Z";

const sampleCode = {
  id: "cm0sample0code0000000000",
  slug: "aB3dE5f",
  title: "Spring menu",
  short_link: shortLinkUrl("aB3dE5f"),
  destination_url: "https://example.com/menu",
  status: "active",
  scan_count: 100,
  created_at: SAMPLE_TIME,
  updated_at: SAMPLE_TIME,
};

const sampleScan = {
  scan_id: "cm0sample0scan0000000000",
  code: { id: sampleCode.id, slug: sampleCode.slug, title: sampleCode.title },
  scanned_at: SAMPLE_TIME,
  country: "DE",
  region: "BE",
  city: "Berlin",
  device_type: "mobile",
  os: "iOS",
  browser: "Safari",
  referer: null,
};

const envelope = <T>(
  type: WebhookEvent,
  data: T,
  id = "evt_sample",
): WebhookEnvelope<T> => ({
  id,
  type,
  created_at: SAMPLE_TIME,
  data,
});

/** Fixed example payloads (also shown in /docs/webhooks). */
export function staticSample(event: WebhookEvent): WebhookEnvelope<unknown> {
  const samples: {
    [K in WebhookEvent]: K extends "scan.created"
      ? ScanBatchData
      : EventDataMap[K];
  } = {
    "scan.created": {
      window_started_at: SAMPLE_TIME,
      window_seconds: SCAN_BATCH_WINDOW_SECONDS,
      count: 1,
      scans: [sampleScan],
    },
    "scan.milestone": {
      milestone: 100,
      code: {
        id: sampleCode.id,
        slug: sampleCode.slug,
        title: sampleCode.title,
        scan_count: 100,
      },
      scan: sampleScan,
    },
    "code.created": { code: sampleCode, actor_id: "user_sample" },
    "code.updated": {
      code: sampleCode,
      changes: ["destination_url"],
      actor_id: "user_sample",
    },
    "form.submitted": {
      response_id: "cm0sample0response000000",
      page: { id: "cm0sample0page0000000000", title: "Feedback" },
      code: { id: sampleCode.id, slug: sampleCode.slug },
      fields: [
        { name: "email", label: "Email", value: "ada@example.com" },
        { name: "rating", label: "How was your visit?", value: "5" },
      ],
      submitted_at: SAMPLE_TIME,
    },
  };
  return envelope(event, samples[event]);
}

/**
 * Recent real items for Zapier's "perform list" (sample data while building a
 * Zap); falls back to the static example when the workspace has none.
 */
export async function recentSamples(
  scope: ActiveScope,
  event: WebhookEvent,
): Promise<WebhookEnvelope<unknown>[]> {
  if (event === "scan.created" || event === "scan.milestone") {
    const rows = await db
      .select({ scan: qrScan, code: qrCode })
      .from(qrScan)
      .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
      .where(codeScope(scope))
      .orderBy(desc(qrScan.scannedAt))
      .limit(3);
    if (rows.length === 0) return [staticSample(event)];
    return rows.map(({ scan, code }) => {
      const summary = scanSummary(scan, code);
      return event === "scan.created"
        ? envelope(
            event,
            {
              window_started_at: summary.scanned_at,
              window_seconds: SCAN_BATCH_WINDOW_SECONDS,
              count: 1,
              scans: [summary],
            } satisfies ScanBatchData,
            `evt_sample_${scan.id}`,
          )
        : envelope(
            event,
            {
              milestone: code.scanCount,
              code: {
                id: code.id,
                slug: code.slug,
                title: code.title,
                scan_count: code.scanCount,
              },
              scan: summary,
            },
            `evt_sample_${scan.id}`,
          );
    });
  }
  if (event === "code.created" || event === "code.updated") {
    const rows = await db
      .select()
      .from(qrCode)
      .where(and(codeScope(scope), isNull(qrCode.deletedAt)))
      .orderBy(
        desc(event === "code.created" ? qrCode.createdAt : qrCode.updatedAt),
      )
      .limit(3);
    if (rows.length === 0) return [staticSample(event)];
    return rows.map((row) =>
      envelope(
        event,
        {
          code: codeSummary({
            ...row,
            status: row.archivedAt ? "archived" : "active",
          }),
          ...(event === "code.updated" ? { changes: [] } : {}),
          actor_id: row.userId,
        },
        `evt_sample_${row.id}`,
      ),
    );
  }
  return [staticSample(event)];
}
