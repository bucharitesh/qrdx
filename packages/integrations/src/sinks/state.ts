import { isIntegrationApiError } from "../core/http-client";
import type {
  SinkDeliveryResult,
  SyncCursor,
  SyncState,
} from "./types";

// Same schedule as webhook deliveries (apps/docs lib/events/deliveries.ts):
// 8 tries over about two days, then the stream stops until "Retry now".
export const SYNC_MAX_ATTEMPTS = 8;
const MINUTE_MS = 60_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * MINUTE_MS;
/** A worker that dies mid-delivery frees the stream after this. */
export const SYNC_LEASE_MS = 5 * MINUTE_MS;
/** Items read per run. */
export const SYNC_BATCH_SIZE = 500;

/** 1 min, 4 min, 16 min, ~1 h, ~4 h, ~17 h, then 24 h (±10% jitter). */
export function syncRetryDelayMs(
  attempts: number,
  random: () => number = Math.random
): number {
  const base = Math.min(
    MINUTE_MS * 4 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS
  );
  return Math.round(base * (0.9 + random() * 0.2));
}

export function initialSyncState(
  organizationId: string | null,
  now: Date = new Date(),
  cursor: SyncCursor | null = null
): SyncState {
  return {
    enabled: true,
    organizationId,
    // Starting now: only items after turning the stream on are sent.
    cursor: cursor ?? { at: now.toISOString(), id: "" },
    attempts: 0,
    nextAttemptAt: null,
    leaseUntil: null,
    status: "idle",
    lastError: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    delivered: 0,
    skipped: 0,
  };
}

/** Reads metadata.sync defensively (it is JSON written by older code too). */
export function readSyncState(value: unknown): SyncState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SyncState>;
  if (typeof raw.enabled !== "boolean") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const cursor =
    raw.cursor && typeof raw.cursor === "object" && str(raw.cursor.at)
      ? { at: raw.cursor.at, id: str(raw.cursor.id) ?? "" }
      : null;
  const status = raw.status;
  return {
    enabled: raw.enabled,
    organizationId: str(raw.organizationId),
    cursor,
    attempts: num(raw.attempts),
    nextAttemptAt: str(raw.nextAttemptAt),
    leaseUntil: str(raw.leaseUntil),
    status:
      status === "ok" ||
      status === "retrying" ||
      status === "failed" ||
      status === "paused"
        ? status
        : "idle",
    lastError: str(raw.lastError),
    lastAttemptAt: str(raw.lastAttemptAt),
    lastSuccessAt: str(raw.lastSuccessAt),
    delivered: num(raw.delivered),
    skipped: num(raw.skipped),
  };
}

/** Enabled, not failed for good, not leased, and its retry time has come. */
export function isSyncDue(state: SyncState, now: Date = new Date()): boolean {
  if (!state.enabled || state.status === "failed" || state.status === "paused") {
    return false;
  }
  if (state.leaseUntil && Date.parse(state.leaseUntil) > now.getTime()) {
    return false;
  }
  return !state.nextAttemptAt || Date.parse(state.nextAttemptAt) <= now.getTime();
}

/**
 * Errors worth retrying: rate limits, provider outages, network failures.
 * Rejected credentials or a deleted sheet/audience need the person.
 */
export function isRetryableSyncError(error: unknown): boolean {
  if (!isIntegrationApiError(error)) return true;
  return (
    error.code === "rate_limited" ||
    error.code === "server" ||
    error.code === "network"
  );
}

/** Text for the dashboard and logs: provider and status, no response body. */
export function describeSyncError(error: unknown): string {
  if (isIntegrationApiError(error)) {
    const labels: Record<string, string> = {
      unauthorized: "the connection was rejected; reconnect the account",
      forbidden: "the account doesn't allow this",
      not_found: "the destination no longer exists",
      rate_limited: "rate limited",
      server: "the service had an error",
      network: "the service couldn't be reached",
      bad_request: "the request was rejected",
      conflict: "conflict",
      upgrade_required: "needs a paid plan",
    };
    const status = error.status ? ` (HTTP ${error.status})` : "";
    return `${labels[error.code] ?? error.code}${status}`;
  }
  return "unexpected error";
}

/** State after a delivery attempt; `now` is when the attempt finished. */
export function nextSyncState(
  state: SyncState,
  outcome: { ok: true; result: SinkDeliveryResult } | { ok: false; error: unknown },
  now: Date = new Date(),
  random: () => number = Math.random
): SyncState {
  const base = { ...state, leaseUntil: null, lastAttemptAt: now.toISOString() };
  if (outcome.ok) {
    const { result } = outcome;
    return {
      ...base,
      cursor: result.cursor ?? state.cursor,
      attempts: 0,
      nextAttemptAt: null,
      status: "ok",
      lastError: null,
      lastSuccessAt: now.toISOString(),
      delivered: state.delivered + result.delivered,
      skipped: state.skipped + result.skipped,
    };
  }
  const attempts = state.attempts + 1;
  const retry =
    isRetryableSyncError(outcome.error) && attempts < SYNC_MAX_ATTEMPTS;
  return {
    ...base,
    attempts,
    status: retry ? "retrying" : "failed",
    lastError: describeSyncError(outcome.error),
    nextAttemptAt: retry
      ? new Date(now.getTime() + syncRetryDelayMs(attempts, random)).toISOString()
      : null,
  };
}

/** "Retry now" and re-enabling: clear the failure, keep the cursor. */
export function resumeSyncState(state: SyncState): SyncState {
  return {
    ...state,
    enabled: true,
    attempts: 0,
    nextAttemptAt: null,
    leaseUntil: null,
    status: state.status === "failed" || state.status === "paused" ? "idle" : state.status,
    lastError: null,
  };
}

/** Last item per key wins, original order kept (e.g. one contact per email). */
export function dedupeLatest<T>(items: T[], key: (item: T) => string): T[] {
  const last = new Map<string, number>();
  items.forEach((item, index) => {
    last.set(key(item), index);
  });
  return items.filter((item, index) => last.get(key(item)) === index);
}

/** The cursor after a batch of items read in (time, id) order. */
export function cursorAfter<T>(
  items: T[],
  read: (item: T) => SyncCursor
): SyncCursor | null {
  const last = items.at(-1);
  return last ? read(last) : null;
}
