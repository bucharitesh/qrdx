import "server-only";
import { createPrivateKey, type KeyObject, sign } from "node:crypto";
import { CANONICAL_HOST } from "@repo/config";
import { env } from "@/env";
import { cached, withTimeout } from "./cache";
import { weekOfDay } from "./weeks";

// Google Search Console for /admin/growth, read server-side with a service
// account (GSC_SERVICE_ACCOUNT_JSON): a JWT signed here with node:crypto
// (RS256) is exchanged for a read-only access token, then Search Analytics
// is queried. Nothing about the key or the token is ever logged or shown.
// Cached for 6 hours per server instance; a failure for 5 minutes.

export const GSC_PROPERTY = `sc-domain:${CANONICAL_HOST}`;
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** Fixed, whatever the key file says: the signed JWT only ever goes here. */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const QUERY_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_PROPERTY)}/searchAnalytics/query`;

const TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Window for the top pages and queries, ending on the last day with data. */
export const TOP_DAYS = 28;
const TOP_LIMIT = 10;

export interface ServiceAccount {
  clientEmail: string;
  privateKey: KeyObject;
  keyId?: string;
}

/**
 * A Google service account's JSON key: needs `client_email` and an RSA
 * `private_key` (PEM; `\n` written out as two characters is accepted too).
 * Null for anything else.
 */
export function parseServiceAccount(json: string): ServiceAccount | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const {
    client_email: clientEmail,
    private_key: pem,
    private_key_id: keyId,
  } = data as Record<string, unknown>;
  if (typeof clientEmail !== "string" || !clientEmail.includes("@")) {
    return null;
  }
  if (typeof pem !== "string") return null;
  try {
    const privateKey = createPrivateKey(pem.replace(/\\n/g, "\n"));
    if (privateKey.asymmetricKeyType !== "rsa") return null;
    return {
      clientEmail,
      privateKey,
      keyId: typeof keyId === "string" && keyId ? keyId : undefined,
    };
  } catch {
    return null;
  }
}

const base64url = (value: string) => Buffer.from(value).toString("base64url");

/** The signed assertion for Google's JWT bearer grant (RFC 7523), valid 1 h. */
export function signServiceAccountJwt(
  account: ServiceAccount,
  {
    scope = GSC_SCOPE,
    audience = GOOGLE_TOKEN_URL,
    now = new Date(),
  }: { scope?: string; audience?: string; now?: Date } = {},
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(account.keyId ? { kid: account.keyId } : {}),
  };
  const claims = {
    iss: account.clientEmail,
    scope,
    aud: audience,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  // RSA keys sign with PKCS#1 v1.5 padding by default: RS256.
  const signature = sign(
    "sha256",
    Buffer.from(input),
    account.privateKey,
  ).toString("base64url");
  return `${input}.${signature}`;
}

export interface SearchRow {
  keys: string[];
  clicks: number;
  impressions: number;
}

/** Search Analytics `rows`, keeping well-formed ones. */
export function parseRows(value: unknown): SearchRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const { keys, clicks, impressions } = (row ?? {}) as Record<
      string,
      unknown
    >;
    return Array.isArray(keys) &&
      keys.every((key) => typeof key === "string") &&
      typeof clicks === "number" &&
      typeof impressions === "number"
      ? [{ keys: keys as string[], clicks, impressions }]
      : [];
  });
}

export interface SearchWeek {
  week: string;
  clicks: number;
  impressions: number;
  /** Days of the week Search Console had data for */
  days: number;
}

/** Daily rows (dimension "date") summed into the page's weeks. */
export function weeklySearch(
  weeks: readonly string[],
  daily: readonly SearchRow[],
): SearchWeek[] {
  const byWeek = new Map<string, SearchWeek>(
    weeks.map((week) => [week, { week, clicks: 0, impressions: 0, days: 0 }]),
  );
  for (const row of daily) {
    const entry = byWeek.get(weekOfDay(row.keys[0] ?? ""));
    if (!entry) continue;
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.days += 1;
  }
  return [...byWeek.values()];
}

export interface SearchTop {
  key: string;
  clicks: number;
  impressions: number;
}

/** Most clicks first, then most impressions: n is small, ties are common. */
export function topSearch(
  rows: readonly SearchRow[],
  limit = TOP_LIMIT,
): SearchTop[] {
  return rows
    .map((row) => ({
      key: row.keys[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        a.key.localeCompare(b.key),
    )
    .slice(0, limit);
}

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

export interface SearchConsoleData {
  weekly: SearchWeek[];
  /** Latest day Search Console has final data for (it runs 2 to 3 days behind) */
  lastDay: string | null;
  top: { from: string; to: string; pages: SearchTop[]; queries: SearchTop[] };
}

export type SearchConsoleResult =
  | { status: "unconfigured" }
  | { status: "invalid" }
  | { status: "error"; message: string }
  | ({ status: "ok"; fetchedAt: string } & SearchConsoleData);

/** A short, secret-free reason from a Google error response. */
async function failure(response: Response, what: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: unknown; status?: unknown };
    error_description?: unknown;
  } | null;
  const reason =
    typeof body?.error === "string"
      ? [body.error, body.error_description].filter(Boolean).join(": ")
      : typeof body?.error?.message === "string"
        ? body.error.message
        : "";
  return new Error(
    `${what} failed (HTTP ${response.status}${reason ? `: ${String(reason).slice(0, 160)}` : ""})`,
  );
}

async function accessToken(
  account: ServiceAccount,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signServiceAccountJwt(account),
    }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw await failure(response, "Google sign-in");
  const { access_token: token } = (await response.json()) as {
    access_token?: unknown;
  };
  if (typeof token !== "string" || !token) {
    throw new Error("Google sign-in returned no access token");
  }
  return token;
}

async function query(
  token: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<SearchRow[]> {
  const response = await fetch(QUERY_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw await failure(response, "Search Console query");
  return parseRows(((await response.json()) as { rows?: unknown }).rows);
}

async function load(
  account: ServiceAccount,
  weeks: readonly string[],
  today: string,
): Promise<SearchConsoleData> {
  return withTimeout(TIMEOUT_MS, async (signal) => {
    const token = await accessToken(account, signal);
    const daily = await query(
      token,
      {
        startDate: weeks[0],
        endDate: today,
        dimensions: ["date"],
        rowLimit: 500,
      },
      signal,
    );
    const lastDay = daily.reduce<string | null>((latest, row) => {
      const day = row.keys[0] ?? "";
      return !latest || day > latest ? day : latest;
    }, null);
    const to = lastDay ?? today;
    const from = addDays(to, 1 - TOP_DAYS);
    const top = (dimension: "page" | "query") =>
      query(
        token,
        { startDate: from, endDate: to, dimensions: [dimension], rowLimit: 50 },
        signal,
      ).then((rows) => topSearch(rows));
    const [pages, queries] = await Promise.all([top("page"), top("query")]);
    return {
      weekly: weeklySearch(weeks, daily),
      lastDay,
      top: { from, to, pages, queries },
    };
  });
}

export async function getSearchConsole(
  weeks: readonly string[],
  now = new Date(),
): Promise<SearchConsoleResult> {
  const json = env.GSC_SERVICE_ACCOUNT_JSON;
  if (!json) return { status: "unconfigured" };
  const account = parseServiceAccount(json);
  if (!account) return { status: "invalid" };
  const today = now.toISOString().slice(0, 10);
  try {
    const data = await cached(
      `growth:gsc:${weeks[0]}:${today}`,
      TTL_MS,
      async () => ({
        ...(await load(account, weeks, today)),
        fetchedAt: new Date().toISOString(),
      }),
      FAILURE_TTL_MS,
    );
    return { status: "ok", ...data };
  } catch (error) {
    return {
      status: "error",
      message: (error instanceof Error ? error.message : String(error))
        .split("\n")[0]
        .slice(0, 200),
    };
  }
}
