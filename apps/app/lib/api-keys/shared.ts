// API keys: their format, the access presets, the input rules and the first
// request to try. Client-safe: Settings → Developers imports it, and the
// server modules (crypto.ts, service.ts) build on it.

import { API_BASE_URL, CANONICAL_HOST } from "@repo/config";
import { z } from "zod";
import {
  OAUTH_SCOPE_INFO,
  OAUTH_SCOPES,
  type OAuthScope,
} from "@/lib/oauth-scopes";

/** Every key starts with this, so secret scanners and people can spot one. */
export const API_KEY_PREFIX = "qrdx_";

/** Random base62 characters after the prefix: 40 × log2(62) ≈ 238 bits. */
export const API_KEY_RANDOM_LENGTH = 40;

/**
 * The whole key. Base62 only, so a double-click selects all of it. It can't
 * be mistaken for an OAuth access token (43 base64url characters), a client
 * ID (`qrdx_app_…`) or a client secret (`qrdx_secret_…`).
 */
export const API_KEY_PATTERN = /^qrdx_[0-9A-Za-z]{40}$/;

/** Kept in clear (`qrdx_` and 6 more) so lists can tell keys apart. */
export const API_KEY_START_LENGTH = API_KEY_PREFIX.length + 6;

/** Active (unrevoked, unexpired) keys one person may have in one workspace. */
export const MAX_API_KEYS = 25;

export function isApiKeyFormat(token: string): boolean {
  return API_KEY_PATTERN.test(token);
}

/** `qrdx_aB3dE5…`: how lists show a key. */
export function maskedKey(start: string): string {
  return `${start}…`;
}

// ─── Access ──────────────────────────────────────────────────────────────────

export type ApiKeyAccess = "full" | "read" | "custom";

/** The scopes behind each preset of the create form. */
export const API_KEY_PRESETS: Record<
  Exclude<ApiKeyAccess, "custom">,
  readonly OAuthScope[]
> = {
  full: OAUTH_SCOPES,
  read: OAUTH_SCOPES.filter((scope) => scope.endsWith(":read")),
};

/** Scopes in the catalogue's order, each once. */
export function normalizeScopes(scopes: readonly string[]): OAuthScope[] {
  return OAUTH_SCOPES.filter((scope) => scopes.includes(scope));
}

const sameScopes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((scope) => b.includes(scope));

export function accessOf(scopes: readonly string[]): ApiKeyAccess {
  const normalized = normalizeScopes(scopes);
  if (sameScopes(normalized, API_KEY_PRESETS.full)) return "full";
  if (sameScopes(normalized, API_KEY_PRESETS.read)) return "read";
  return "custom";
}

/** "Full access", "Read only" or the scopes' labels. */
export function accessLabel(scopes: readonly string[]): string {
  const access = accessOf(scopes);
  if (access === "full") return "Full access";
  if (access === "read") return "Read only";
  return normalizeScopes(scopes)
    .map((scope) => OAUTH_SCOPE_INFO[scope].label)
    .join(", ");
}

// ─── Input ───────────────────────────────────────────────────────────────────

/** Days until a new key expires; null = never. */
export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const;
export type ApiKeyExpiryDays = (typeof API_KEY_EXPIRY_DAYS)[number];

export const apiKeyInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the key a name.")
    .max(64, "Use at most 64 characters for the name."),
  scopes: z
    .array(z.enum(OAUTH_SCOPES))
    .min(1, "Choose at least one scope.")
    .max(OAUTH_SCOPES.length)
    .transform(normalizeScopes),
  expiresInDays: z.literal(API_KEY_EXPIRY_DAYS).nullable(),
});
export type ApiKeyInput = z.input<typeof apiKeyInputSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function expiryDate(
  expiresInDays: ApiKeyExpiryDays | null,
  now: Date,
): Date | null {
  return expiresInDays === null
    ? null
    : new Date(now.getTime() + expiresInDays * DAY_MS);
}

// ─── First request ───────────────────────────────────────────────────────────

/**
 * The API's base URL as seen from `origin`: api.qrdx.dev on qrdx.dev, the
 * same routes under /api/v1 anywhere else (self-hosted, preview, localhost).
 */
export function apiBaseFor(origin: string): string {
  const { protocol, host } = new URL(origin);
  return host === CANONICAL_HOST && protocol === "https:"
    ? API_BASE_URL
    : `${protocol}//${host}/api/v1`;
}

/**
 * A ready-to-run curl for a new key: the first request its scopes allow,
 * with the key inlined. Creating a code is the best first call, so a key
 * that can write does that.
 */
export function firstRequest(
  apiBase: string,
  key: string,
  scopes: readonly string[],
): { description: string; command: string } {
  const auth = `  -H "Authorization: Bearer ${key}"`;
  if (scopes.includes("codes:write")) {
    return {
      description: "Create a dynamic code that opens example.com",
      command: [
        `curl -X POST ${apiBase}/codes \\`,
        `${auth} \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"destinationUrl": "https://example.com"}'`,
      ].join("\n"),
    };
  }
  if (scopes.includes("codes:read")) {
    return {
      description: "List your dynamic codes",
      command: `curl "${apiBase}/codes?limit=5" \\\n${auth}`,
    };
  }
  if (scopes.includes("themes:read")) {
    return {
      description: "List your saved themes",
      command: `curl ${apiBase}/themes \\\n${auth}`,
    };
  }
  return {
    description: "Read the profile behind the key",
    command: `curl ${apiBase}/me \\\n${auth}`,
  };
}
