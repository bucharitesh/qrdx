// Where passkeys work. WebAuthn binds every passkey to a host (the "relying
// party ID") and checks the page's origin on each use, so QRdx accepts
// exactly one origin: the app's own URL. Pure and client-safe: the app's
// availability rules (apps/docs/lib/feature-availability-rules.ts) read it
// too.

export interface PasskeyRelyingParty {
  /** The host passkeys belong to: "qrdx.dev", "localhost" */
  rpID: string;
  /** The only origin passkeys are accepted from: "https://qrdx.dev" */
  origin: string;
}

export interface PasskeyUrls {
  BETTER_AUTH_URL?: string | undefined;
  NEXT_PUBLIC_APP_URL?: string | undefined;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function parseUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/**
 * The relying party for this deployment, from BETTER_AUTH_URL (else
 * NEXT_PUBLIC_APP_URL). Null where passkeys can't work: no URL, plain http
 * anywhere but localhost (browsers only allow WebAuthn in secure contexts),
 * an IP address (not a valid relying party ID), or BETTER_AUTH_URL and
 * NEXT_PUBLIC_APP_URL on different origins (the pages and the auth API
 * would disagree about where passkeys live).
 */
export function passkeyRelyingParty(
  env: PasskeyUrls
): PasskeyRelyingParty | null {
  const authUrl = parseUrl(env.BETTER_AUTH_URL);
  const appUrl = parseUrl(env.NEXT_PUBLIC_APP_URL);
  const url = authUrl ?? appUrl;
  if (!url) return null;
  if (authUrl && appUrl && authUrl.origin !== appUrl.origin) return null;
  const host = url.hostname;
  if (IPV4.test(host) || host.startsWith("[")) return null;
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && host === "localhost");
  if (!secure) return null;
  return { rpID: host, origin: url.origin };
}

/** True when a page at `origin` can use this deployment's passkeys. */
export function isPasskeyOrigin(
  relyingParty: PasskeyRelyingParty | null,
  origin: string | null | undefined
): boolean {
  return Boolean(relyingParty && origin && origin === relyingParty.origin);
}
