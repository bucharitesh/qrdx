// What developers may register on an OAuth app, and the redirect check at
// authorization time. Pure and client-safe: the settings form shows the same
// messages the server enforces.

import { z } from "zod";
import { OAUTH_SCOPES } from "@/lib/oauth-scopes";

export const MAX_REDIRECT_URIS = 10;
export const MAX_URL_LENGTH = 2048;
export const MIN_APP_NAME_LENGTH = 2;
export const MAX_APP_NAME_LENGTH = 60;
export const MAX_APP_DESCRIPTION_LENGTH = 300;

// Plain http:// is only for local development.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// URL parsers drop or rewrite whitespace and control characters, and browsers
// treat "\" like "/", so the URL a browser follows could differ from the one
// that was registered.
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f\u007f]/;

export type UrlCheck =
  | { ok: true; url: string }
  | { ok: false; message: string };

const fail = (message: string): UrlCheck => ({ ok: false, message });

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** https://, or http:// on localhost; no credentials. */
function checkWebUrl(url: URL, label: string): UrlCheck | null {
  if (url.username || url.password) {
    return fail(`${label} can't contain a username or password.`);
  }
  if (url.protocol === "http:") {
    return isLoopbackHost(url.hostname)
      ? null
      : fail(`${label} must use https:// (http:// only works for localhost).`);
  }
  if (url.protocol !== "https:") {
    return fail(
      `${label} must start with https:// (or http://localhost for development).`,
    );
  }
  return url.hostname ? null : fail(`${label} needs a host name.`);
}

/**
 * A redirect URI as it is registered: kept exactly as typed (trimmed), since
 * authorization requests must send the same string.
 */
export function checkRedirectUri(input: string): UrlCheck {
  const value = input.trim();
  if (!value) return fail("Enter a redirect URI.");
  if (value.length > MAX_URL_LENGTH) {
    return fail(`Redirect URIs can be up to ${MAX_URL_LENGTH} characters.`);
  }
  if (UNSAFE_CHARACTERS.test(value)) {
    return fail(
      "Redirect URIs can't contain spaces, backslashes or control characters.",
    );
  }
  if (value.includes("*")) {
    return fail(
      "Wildcards aren't supported. Register every redirect URI exactly.",
    );
  }
  if (value.includes("#")) {
    return fail("Redirect URIs can't contain a fragment (#).");
  }
  const url = /^https?:\/\//i.test(value) ? parseUrl(value) : null;
  if (!url) {
    return fail("Enter a full URL, like https://example.com/callback.");
  }
  return checkWebUrl(url, "Redirect URIs") ?? { ok: true, url: value };
}

export type RedirectUrisCheck =
  | { ok: true; uris: string[] }
  | { ok: false; message: string };

/** Blank lines are ignored and duplicates dropped; 1–10 URIs. */
export function checkRedirectUris(
  inputs: readonly string[],
): RedirectUrisCheck {
  const uris: string[] = [];
  for (const input of inputs) {
    if (!input.trim()) continue;
    const checked = checkRedirectUri(input);
    if (!checked.ok) {
      return { ok: false, message: `${input.trim()}: ${checked.message}` };
    }
    if (!uris.includes(checked.url)) uris.push(checked.url);
  }
  if (uris.length === 0) {
    return { ok: false, message: "Add at least one redirect URI." };
  }
  if (uris.length > MAX_REDIRECT_URIS) {
    return {
      ok: false,
      message: `An app can have up to ${MAX_REDIRECT_URIS} redirect URIs.`,
    };
  }
  return { ok: true, uris };
}

/**
 * Authorization-time check: `uri` must equal a registered URI character for
 * character (no prefix, wildcard or normalised matching), and must still be a
 * plain http(s) URL without a fragment, whatever was registered before these
 * rules existed.
 */
export function isAllowedRedirectUri(
  uri: string,
  registered: readonly string[],
): boolean {
  if (!registered.includes(uri)) return false;
  if (uri.includes("#") || UNSAFE_CHARACTERS.test(uri)) return false;
  const url = parseUrl(uri);
  return (
    url !== null &&
    (url.protocol === "https:" || url.protocol === "http:") &&
    !url.username &&
    !url.password
  );
}

/** Website or logo URL: optional; https:// (http:// on localhost). */
export function checkOptionalUrl(input: string, label: string): UrlCheck {
  const value = input.trim();
  if (!value) return { ok: true, url: "" };
  if (value.length > MAX_URL_LENGTH) {
    return fail(`${label} can be up to ${MAX_URL_LENGTH} characters.`);
  }
  if (UNSAFE_CHARACTERS.test(value)) {
    return fail(`${label} can't contain spaces or control characters.`);
  }
  const url = parseUrl(value);
  if (!url)
    return fail(`${label} must be a full URL, like https://example.com.`);
  return checkWebUrl(url, label) ?? { ok: true, url: url.toString() };
}

const optionalUrlSchema = (label: string) =>
  z
    .string()
    .max(MAX_URL_LENGTH * 2)
    .optional()
    .transform((value, ctx) => {
      const checked = checkOptionalUrl(value ?? "", label);
      if (!checked.ok) {
        ctx.addIssue({ code: "custom", message: checked.message });
        return z.NEVER;
      }
      return checked.url || null;
    });

export const redirectUrisSchema = z
  .array(z.string().max(MAX_URL_LENGTH * 2))
  .max(MAX_REDIRECT_URIS * 3)
  .transform((inputs, ctx) => {
    const checked = checkRedirectUris(inputs);
    if (!checked.ok) {
      ctx.addIssue({ code: "custom", message: checked.message });
      return z.NEVER;
    }
    return checked.uris;
  });

export const oauthScopesSchema = z
  .array(z.enum(OAUTH_SCOPES))
  .min(1, "Pick at least one scope.")
  .max(OAUTH_SCOPES.length)
  .transform((scopes) =>
    // Stable order, no duplicates.
    OAUTH_SCOPES.filter((scope) => scopes.includes(scope)),
  );

/** Everything the create and edit forms send. */
export const oauthAppInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      MIN_APP_NAME_LENGTH,
      `Name must be at least ${MIN_APP_NAME_LENGTH} characters.`,
    )
    .max(
      MAX_APP_NAME_LENGTH,
      `Name can be up to ${MAX_APP_NAME_LENGTH} characters.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      MAX_APP_DESCRIPTION_LENGTH,
      `Description can be up to ${MAX_APP_DESCRIPTION_LENGTH} characters.`,
    )
    .optional()
    .transform((value) => value || null),
  websiteUrl: optionalUrlSchema("Website"),
  logoUrl: optionalUrlSchema("Logo URL"),
  redirectUris: redirectUrisSchema,
  scopes: oauthScopesSchema,
  pkceRequired: z.boolean(),
});

export type OAuthAppInput = z.input<typeof oauthAppInputSchema>;
export type OAuthAppValues = z.output<typeof oauthAppInputSchema>;
