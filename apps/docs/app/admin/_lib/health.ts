import "server-only";

import { database as db, webhookDelivery } from "@repo/database";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { redis } from "@repo/rate-limit";
import { and, count, eq, gte, lte, min, sql } from "drizzle-orm";
import { type CronJob, type CronRun, getCronRuns } from "@/lib/cron-runs";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { isEmailConfigured } from "@/lib/email/send";
import { env } from "@/lib/env";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { headObject, isStorageConfigured } from "@/lib/storage/r2";
import { cached, withTimeout } from "./cache";
import { probePolar } from "./polar";

// /admin/health: one cheap, read-only probe per service, each with a
// timeout and cached for 60 s per server instance. Results carry names and
// short messages only, never a secret value.

export type ProbeStatus = "ok" | "warn" | "error" | "off";

export interface Probe {
  id: string;
  name: string;
  status: ProbeStatus;
  detail: string;
  latencyMs: number | null;
}

const TTL_MS = 60_000;
const TIMEOUT_MS = 4000;

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .split("\n")[0]
    .slice(0, 160);

/** Times `run`; a throw (or the timeout) becomes an "error" probe. */
function probe(
  id: string,
  name: string,
  run: (signal: AbortSignal) => Promise<Pick<Probe, "status" | "detail">>,
): Promise<Probe> {
  return cached(`health:${id}`, TTL_MS, async () => {
    const started = performance.now();
    try {
      const result = await withTimeout(TIMEOUT_MS, run);
      return {
        id,
        name,
        ...result,
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return {
        id,
        name,
        status: "error",
        detail: message(error),
        latencyMs: Math.round(performance.now() - started),
      };
    }
  });
}

const off = (detail: string) => ({ status: "off" as const, detail });

function probeDatabase() {
  return probe("db", "Database (Neon)", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok", detail: "Reachable" };
  });
}

function probeRedis() {
  return probe("redis", "Redis (Upstash)", async () => {
    if (!redis) return off("Not configured: rate limits are off");
    const reply = await redis.ping();
    return { status: "ok", detail: `PING → ${reply}` };
  });
}

function probeStorage() {
  return probe("r2", "File storage (R2)", async () => {
    if (!isStorageConfigured) return off("Not configured: file uploads hidden");
    // A HEAD on a key that never exists: 404 means reachable and signed in.
    await headObject("health/probe");
    return { status: "ok", detail: "Bucket reachable" };
  });
}

function probeEmail() {
  return probe("email", "Email (Resend)", async () => {
    if (!isEmailConfigured) {
      return off("RESEND_API_KEY or EMAIL_FROM not set: emails are skipped");
    }
    return isOutboundDeliveryAllowed()
      ? { status: "ok", detail: "Configured; sending is on" }
      : {
          status: "warn",
          detail: "Configured; nothing is sent from this environment",
        };
  });
}

function probeBilling() {
  return probe("polar", "Billing (Polar)", async () => {
    const result = await probePolar();
    if (result.detail.includes("not set")) return off(result.detail);
    return { status: result.ok ? "ok" : "error", detail: result.detail };
  });
}

function probeGoogleAi() {
  return probe("google-ai", "Google AI", async (signal) => {
    if (!env.GOOGLE_API_KEY) return off("GOOGLE_API_KEY not set: AI is off");
    // Listing one model is free; the key goes in a header, never the URL.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      {
        headers: { "x-goog-api-key": env.GOOGLE_API_KEY },
        signal,
        cache: "no-store",
      },
    );
    if (response.ok) return { status: "ok", detail: "Key valid" };
    return {
      status: "error",
      detail:
        response.status === 400 || response.status === 403
          ? `Key rejected (HTTP ${response.status})`
          : `HTTP ${response.status}`,
    };
  });
}

export function getServiceProbes(): Promise<Probe[]> {
  return Promise.all([
    probeDatabase(),
    probeRedis(),
    probeStorage(),
    probeEmail(),
    probeBilling(),
    probeGoogleAi(),
  ]);
}

// ─── Integrations ────────────────────────────────────────────────────────────

export interface IntegrationAvailabilityRow {
  slug: string;
  name: string;
  available: boolean;
  /** Variable names still missing (never values) */
  missing: string[];
}

export function getIntegrationHealth(): IntegrationAvailabilityRow[] {
  const availability = getIntegrationAvailability();
  return getCatalogBySurface("integrations")
    .map((entry) => {
      const missing = availability.needsSetup[entry.slug] ?? [];
      return {
        slug: entry.slug,
        name: entry.name,
        available: missing.length === 0,
        missing,
      };
    })
    .sort((a, b) => Number(a.available) - Number(b.available));
}

// ─── Cron and webhook backlog ────────────────────────────────────────────────

export function getCronHealth(): Promise<Record<CronJob, CronRun | null>> {
  return cached("health:cron", TTL_MS, () =>
    withTimeout(TIMEOUT_MS, () => getCronRuns()),
  );
}

export function getWebhookBacklog() {
  return cached("health:webhooks", TTL_MS, async () => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [[pending], [failed]] = await Promise.all([
      db
        .select({
          total: count(),
          due: sql<number>`count(*) filter (where ${lte(webhookDelivery.nextAttemptAt, sql`now()`)})`.mapWith(
            Number,
          ),
          oldestDue: min(webhookDelivery.nextAttemptAt),
        })
        .from(webhookDelivery)
        .where(eq(webhookDelivery.status, "pending")),
      db
        .select({ total: count() })
        .from(webhookDelivery)
        .where(
          and(
            eq(webhookDelivery.status, "failed"),
            gte(webhookDelivery.createdAt, dayAgo),
          ),
        ),
    ]);
    return {
      pending: pending?.total ?? 0,
      due: pending?.due ?? 0,
      oldestDue: pending?.oldestDue ?? null,
      failed24h: failed?.total ?? 0,
    };
  });
}

// ─── Build ───────────────────────────────────────────────────────────────────

export function getBuildInfo() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return {
    environment: process.env.VERCEL_ENV ?? env.NODE_ENV,
    commit: sha ? sha.slice(0, 7) : null,
    commitUrl:
      sha &&
      process.env.VERCEL_GIT_REPO_OWNER &&
      process.env.VERCEL_GIT_REPO_SLUG
        ? `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}/commit/${sha}`
        : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
  };
}

/** Optional features: whether each is configured (names only). */
export function getConfiguration(): {
  name: string;
  on: boolean;
  vars: string;
}[] {
  const set = (value: string | undefined) => Boolean(value);
  return [
    {
      name: "Cron secret",
      on: set(env.CRON_SECRET),
      vars: "CRON_SECRET",
    },
    {
      name: "Integration token encryption",
      on: set(env.INTEGRATION_ENCRYPTION_KEY),
      vars: "INTEGRATION_ENCRYPTION_KEY",
    },
    {
      name: "Custom domains (Vercel)",
      on: set(env.VERCEL_API_TOKEN) && set(env.VERCEL_PROJECT_ID),
      vars: "VERCEL_API_TOKEN, VERCEL_PROJECT_ID",
    },
    {
      name: "Safe Browsing (Web Risk)",
      on: set(env.WEB_RISK_API_KEY),
      vars: "WEB_RISK_API_KEY",
    },
    {
      name: "Turnstile",
      on: set(env.TURNSTILE_SECRET_KEY),
      vars: "TURNSTILE_SECRET_KEY",
    },
    { name: "AI QR art (fal.ai)", on: set(env.FAL_KEY), vars: "FAL_KEY" },
    {
      name: "Polar webhooks",
      on: set(env.POLAR_WEBHOOK_SECRET),
      vars: "POLAR_WEBHOOK_SECRET",
    },
  ];
}
