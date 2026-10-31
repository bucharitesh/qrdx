import "server-only";

import { database as db, integration } from "@repo/database";
import {
  appendScansToSheet,
  createGoogleSheetsClient,
  type SheetSyncTarget,
} from "@repo/integrations/src/integrations/google-sheets";
import { createHubSpotClient, upsertResponsesToHubSpot } from "@repo/integrations/src/integrations/hubspot";
import {
  createMailchimpClient,
  type MailchimpSettings,
  mailchimpTargets,
  syncResponsesToMailchimp,
} from "@repo/integrations/src/integrations/mailchimp";
import type { ResponseSinkSettings } from "@repo/integrations/src/sinks/mapping";
import {
  isSyncDue,
  nextSyncState,
  readSyncState,
  SYNC_BATCH_SIZE,
  SYNC_LEASE_MS,
} from "@repo/integrations/src/sinks/state";
import {
  isIntegrationApiError,
  isSinkProvider,
  SINK_PROVIDERS,
  type SinkDeliveryResult,
  type SinkProviderSlug,
  type SyncState,
} from "@repo/integrations";
import { and, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { getConnection } from "@/lib/connected-accounts/server";
import { isScopeMember, loadResponses, loadScans } from "./data";
import { dataCallsAllowed } from "./server";

// Data-out worker. Each sink integration keeps its stream state in
// integration.metadata.sync (no extra tables): a (time, id) cursor, failed
// attempts with the webhook backoff schedule, a crash-safe lease and the last
// outcome for the dashboard. Items are read after the cursor in batches and
// delivered in batches; the cursor only moves after the tool accepted them,
// and every sink is idempotent (upsert by email / scan id checks), so a
// retry never duplicates anything.

function log(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...fields }));
}

const metaJson = sql`coalesce(${integration.metadata}::jsonb, '{}'::jsonb)`;

/** Writes metadata.sync (and optionally merges metadata.settings) in place. */
export async function writeSyncState(
  integrationId: string,
  state: SyncState,
  settingsPatch?: Record<string, unknown>,
): Promise<void> {
  const withSync = sql`jsonb_set(${metaJson}, '{sync}', ${JSON.stringify(state)}::jsonb)`;
  const value = settingsPatch
    ? sql`jsonb_set(${withSync}, '{settings}', coalesce(${metaJson} -> 'settings', '{}'::jsonb) || ${JSON.stringify(settingsPatch)}::jsonb)`
    : withSync;
  await db
    .update(integration)
    .set({ metadata: sql`(${value})::json`, updatedAt: new Date() })
    .where(eq(integration.id, integrationId));
}

/**
 * Takes the stream's lease in one statement, so two workers (cron and a
 * form-submit trigger) never deliver the same batch.
 */
async function claim(integrationId: string, now: Date): Promise<boolean> {
  const lease = new Date(now.getTime() + SYNC_LEASE_MS).toISOString();
  const rows = await db
    .update(integration)
    .set({
      metadata: sql`jsonb_set(${metaJson}, '{sync,leaseUntil}', to_jsonb(${lease}::text))::json`,
    })
    .where(
      and(
        eq(integration.id, integrationId),
        eq(integration.status, "active"),
        sql`(${integration.metadata}::jsonb #>> '{sync,enabled}') = 'true'`,
        sql`coalesce(nullif(${integration.metadata}::jsonb #>> '{sync,leaseUntil}', '')::timestamptz, 'epoch'::timestamptz) < ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: integration.id });
  return rows.length > 0;
}

interface SinkRow {
  id: string;
  userId: string;
  provider: SinkProviderSlug;
  metadata: Record<string, unknown>;
}

const settingsOf = (metadata: Record<string, unknown>) =>
  (metadata.settings ?? {}) as Record<string, unknown>;

export function readSheetTarget(
  metadata: Record<string, unknown>,
): SheetSyncTarget | null {
  const target = settingsOf(metadata).syncTarget as SheetSyncTarget | undefined;
  return target?.spreadsheetId ? target : null;
}

/** Delivers one batch for the stream. */
async function deliverBatch(
  row: SinkRow,
  state: SyncState,
  accessToken: string,
): Promise<{
  result: SinkDeliveryResult;
  settingsPatch?: Record<string, unknown>;
  read: number;
}> {
  const scope = { userId: row.userId, organizationId: state.organizationId };
  const settings = settingsOf(row.metadata);

  if (row.provider === "google-sheets") {
    const target = readSheetTarget(row.metadata);
    if (!target) throw new Error("No sheet to sync to");
    const scans = await loadScans(scope, {
      codeId: target.codeId,
      cursor: state.cursor,
      limit: SYNC_BATCH_SIZE,
    });
    if (scans.length === 0) {
      return { result: { delivered: 0, skipped: 0, cursor: null }, read: 0 };
    }
    const result = await appendScansToSheet(
      createGoogleSheetsClient(accessToken),
      target,
      scans,
      { isRetry: state.attempts > 0 },
    );
    return {
      result,
      read: scans.length,
      settingsPatch: { syncTarget: { ...target, rowsWritten: result.rowsWritten } },
    };
  }

  const responseSettings = settings as unknown as ResponseSinkSettings;
  const responses = await loadResponses(scope, {
    pageIds: responseSettings.pageIds ?? null,
    cursor: state.cursor,
    limit: SYNC_BATCH_SIZE,
  });
  if (responses.length === 0) {
    return { result: { delivered: 0, skipped: 0, cursor: null }, read: 0 };
  }
  if (row.provider === "hubspot") {
    return {
      result: await upsertResponsesToHubSpot(
        createHubSpotClient(accessToken),
        { pageIds: responseSettings.pageIds ?? null, forms: responseSettings.forms ?? {} },
        responses,
      ),
      read: responses.length,
    };
  }
  const mailchimp = settings as unknown as MailchimpSettings & {
    mergeFields?: Array<{ tag: string; name: string; type: string }>;
  };
  const dc = String(row.metadata.dc ?? "");
  return {
    result: await syncResponsesToMailchimp(
      createMailchimpClient(accessToken, dc),
      {
        audienceId: mailchimp.audienceId,
        tags: mailchimp.tags ?? [],
        withoutConsent: mailchimp.withoutConsent ?? "pending",
        pageIds: mailchimp.pageIds ?? null,
        forms: mailchimp.forms ?? {},
      },
      mailchimpTargets(mailchimp.mergeFields ?? []),
      responses,
    ),
    read: responses.length,
  };
}

const MAX_BATCHES_PER_RUN = 10;

/** Runs one stream until it is caught up, fails or the budget is used. */
async function syncOne(row: SinkRow, deadline: number): Promise<"ok" | "failed" | "skipped"> {
  const now = new Date();
  let state = readSyncState(row.metadata.sync);
  if (!(state && isSyncDue(state, now))) return "skipped";
  if (!(await claim(row.id, now))) return "skipped";

  const release = (next: SyncState) => writeSyncState(row.id, { ...next, leaseUntil: null });

  try {
    if (!dataCallsAllowed()) {
      await release({ ...state, lastError: "Not sent: delivery is off outside production" });
      return "skipped";
    }
    const scope = { userId: row.userId, organizationId: state.organizationId };
    if (!(await isScopeMember(scope))) {
      await release({
        ...state,
        enabled: false,
        status: "paused",
        lastError: "Paused: you're no longer a member of that team",
      });
      return "failed";
    }
    const connection = await getConnection(row.userId, row.provider);
    if (connection?.status !== "active") {
      await release({
        ...state,
        status: "failed",
        lastError: "the connection was rejected; reconnect the account",
      });
      return "failed";
    }

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      if (Date.now() > deadline) break;
      let outcome: Awaited<ReturnType<typeof deliverBatch>>;
      try {
        outcome = await deliverBatch(row, state, connection.accessToken);
      } catch (error) {
        state = nextSyncState(state, { ok: false, error });
        await release(state);
        if (isIntegrationApiError(error) && error.code === "unauthorized") {
          await db
            .update(integration)
            .set({ status: "error", updatedAt: new Date() })
            .where(eq(integration.id, row.id));
        }
        // Provider, status and our own text only: no response bodies.
        log("integrations.sync_failed", {
          provider: row.provider,
          integrationId: row.id,
          attempts: state.attempts,
          error: state.lastError,
        });
        return "failed";
      }
      if (outcome.read === 0) break;
      state = nextSyncState(state, { ok: true, result: outcome.result });
      // Keep the lease while more batches follow.
      await writeSyncState(
        row.id,
        { ...state, leaseUntil: new Date(Date.now() + SYNC_LEASE_MS).toISOString() },
        outcome.settingsPatch,
      );
      if (outcome.settingsPatch) {
        row.metadata = {
          ...row.metadata,
          settings: { ...settingsOf(row.metadata), ...outcome.settingsPatch },
        };
      }
      if (outcome.read < SYNC_BATCH_SIZE) break;
    }
    await release(state);
    return "ok";
  } catch (error) {
    // Lease expires and the next run picks the stream up again.
    log("integrations.sync_crashed", {
      provider: row.provider,
      integrationId: row.id,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return "failed";
  }
}

async function loadSinkRows(ids?: string[]): Promise<SinkRow[]> {
  const rows = await db
    .select({
      id: integration.id,
      userId: integration.userId,
      provider: integration.provider,
      metadata: integration.metadata,
    })
    .from(integration)
    .where(
      and(
        inArray(integration.provider, [...SINK_PROVIDERS]),
        eq(integration.status, "active"),
        sql`(${integration.metadata}::jsonb #>> '{sync,enabled}') = 'true'`,
        ids ? inArray(integration.id, ids) : undefined,
      ),
    )
    .limit(500);
  return rows.flatMap((row) =>
    isSinkProvider(row.provider)
      ? [
          {
            ...row,
            provider: row.provider,
            metadata: (row.metadata ?? {}) as Record<string, unknown>,
          },
        ]
      : [],
  );
}

export interface SyncRunSummary {
  streams: number;
  ok: number;
  failed: number;
  skipped: number;
}

/** Cron worker (and triggers): every due stream, within a time budget. */
export async function runIntegrationSyncs({
  budgetMs = 15_000,
  integrationIds,
}: { budgetMs?: number; integrationIds?: string[] } = {}): Promise<SyncRunSummary> {
  const deadline = Date.now() + budgetMs;
  const summary: SyncRunSummary = { streams: 0, ok: 0, failed: 0, skipped: 0 };
  try {
    const rows = await loadSinkRows(integrationIds);
    summary.streams = rows.length;
    for (const row of rows) {
      if (Date.now() > deadline) break;
      summary[await syncOne(row, deadline)]++;
    }
  } catch (error) {
    log("integrations.sync_run_failed", {
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
  return summary;
}

// ─── Triggers from the event pipeline ────────────────────────────────────────

interface StreamIndexEntry {
  id: string;
  userId: string;
  organizationId: string | null;
  provider: SinkProviderSlug;
}

const INDEX_TTL_MS = 30_000;
/** Scans arrive in bursts: one sheet append per stream per 5 minutes. */
const SCAN_TRIGGER_INTERVAL_MS = 5 * 60_000;
let streamIndex: { at: number; entries: StreamIndexEntry[] } | null = null;
const lastScanTrigger = new Map<string, number>();

/** Call after enabling, disabling or reconfiguring a stream. */
export function invalidateStreamIndex() {
  streamIndex = null;
}

async function enabledStreams(): Promise<StreamIndexEntry[]> {
  if (streamIndex && Date.now() - streamIndex.at < INDEX_TTL_MS) {
    return streamIndex.entries;
  }
  const rows = await loadSinkRows();
  const entries = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    organizationId: readSyncState(row.metadata.sync)?.organizationId ?? null,
  }));
  streamIndex = { at: Date.now(), entries };
  return entries;
}

function inScope(
  entry: StreamIndexEntry,
  scope: { userId: string; organizationId: string | null },
) {
  return scope.organizationId
    ? entry.organizationId === scope.organizationId
    : entry.organizationId === null && entry.userId === scope.userId;
}

function runDetached(task: () => Promise<unknown>) {
  const run = () => task().catch(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * A new form response or scan in a workspace: deliver to its streams soon
 * (form responses right away, scans at most every five minutes per stream).
 * Never throws and never blocks the caller; the cron worker covers the rest.
 */
export function triggerIntegrationSyncs(
  scope: { userId: string; organizationId: string | null },
  stream: "scans" | "responses",
): void {
  runDetached(async () => {
    const entries = (await enabledStreams()).filter(
      (entry) =>
        inScope(entry, scope) &&
        (stream === "scans"
          ? entry.provider === "google-sheets"
          : entry.provider !== "google-sheets"),
    );
    const now = Date.now();
    const due = entries.filter((entry) => {
      if (stream !== "scans") return true;
      const last = lastScanTrigger.get(entry.id) ?? 0;
      if (now - last < SCAN_TRIGGER_INTERVAL_MS) return false;
      lastScanTrigger.set(entry.id, now);
      return true;
    });
    if (lastScanTrigger.size > 5000) lastScanTrigger.clear();
    if (due.length === 0) return;
    await runIntegrationSyncs({
      budgetMs: 10_000,
      integrationIds: due.map((entry) => entry.id),
    });
  });
}
