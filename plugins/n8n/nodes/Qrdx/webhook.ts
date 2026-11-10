import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type ApiRequester,
  hookPath,
  type JsonRecord,
  unwrapList,
} from "./api";
import { SIGNATURE_TOLERANCE_SECONDS } from "./constants";

// The trigger's pure parts: QRdx's webhook signature, the items a delivery
// becomes, and keeping exactly one REST hook subscription per webhook URL.

/** `t=<unix seconds>,v1=<hex HMAC-SHA256>` */
export function parseSignatureHeader(header: string): {
  timestamp: number | null;
  signatures: string[];
} {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

/**
 * Checks `X-QRdx-Signature` against the subscription's secret: an
 * HMAC-SHA256 of `<timestamp>.<raw body>`, compared in constant time, with
 * the timestamp no more than five minutes from now.
 */
export function verifySignature(
  secret: string,
  header: string,
  rawBody: string | Buffer,
  nowSeconds: number = Date.now() / 1000
): boolean {
  if (!secret) return false;
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = Buffer.from(
    createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest("hex"),
    "utf8"
  );
  return signatures.some((signature) => {
    const received = Buffer.from(signature, "utf8");
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
}

/**
 * The workflow items of one delivery: the event envelope, or with
 * `splitScans` one item per scan of a scan.created batch.
 */
export function eventItems(
  envelope: JsonRecord,
  { splitScans = false }: { splitScans?: boolean } = {}
): JsonRecord[] {
  const data = envelope.data;
  if (
    splitScans &&
    envelope.type === "scan.created" &&
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as JsonRecord).scans)
  ) {
    const scans = (data as JsonRecord).scans as unknown[];
    return scans
      .filter(
        (scan): scan is JsonRecord => typeof scan === "object" && scan !== null
      )
      .map((scan) => ({
        ...scan,
        event_id: envelope.id,
        event_created_at: envelope.created_at,
      }));
  }
  return [envelope];
}

/** The same events, in any order. */
export function sameEvents(a: unknown, b: readonly string[]): boolean {
  if (!Array.isArray(a)) return false;
  const left = new Set(a.map(String));
  const right = new Set(b);
  return left.size === right.size && [...left].every((e) => right.has(e));
}

/** What the trigger keeps in its static data between activations. */
export interface HookState {
  hookId?: string;
  secret?: string;
}

/**
 * True when QRdx already delivers the chosen events to `webhookUrl` through
 * the subscription this node made (and still has the secret of). Any other
 * subscription to the same URL is removed: it has other events or a secret
 * the node no longer knows, and would deliver twice.
 */
export async function reconcileHooks(
  request: ApiRequester,
  webhookUrl: string,
  events: readonly string[],
  state: HookState
): Promise<boolean> {
  const hooks = unwrapList(await request({ method: "GET", path: "/hooks" }));
  let exists = false;
  for (const hook of hooks) {
    if (hook.target_url !== webhookUrl || typeof hook.id !== "string") {
      continue;
    }
    if (
      !exists &&
      hook.id === state.hookId &&
      state.secret &&
      sameEvents(hook.events, events)
    ) {
      exists = true;
      continue;
    }
    await request({
      method: "DELETE",
      path: hookPath(hook.id),
      allowNotFound: true,
    });
  }
  return exists;
}
