// Workspace single sign-on: pure and client-safe. The SSO plugin's gate
// (./sso.ts), the app's server actions and settings page
// (apps/docs/lib/sso/*, app/dashboard/[workspace]/settings/sso) and tests
// share these.
//
// A workspace has at most one connection (OIDC or SAML) for one email
// domain. The domain covers its subdomains too (the plugin matches
// "eu.acme.com" addresses to an "acme.com" connection), so two workspaces
// may never hold overlapping verified domains.

/** Where Better Auth is mounted (apps/docs/app/api/auth/[...all]). */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * Prefix of the DNS TXT record that proves the domain
 * (`_qrdx-<providerId>.<domain>`, the plugin's `domainVerification.tokenPrefix`).
 */
export const SSO_TOKEN_PREFIX = "qrdx";

export const SSO_PROVIDER_ID_PREFIX = "sso-";
const PROVIDER_ID_RE = /^sso-[a-z0-9]{12}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A new connection's id, used in its callback URLs and DNS record. */
export function newSsoProviderId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let id = SSO_PROVIDER_ID_PREFIX;
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

export function isSsoProviderId(value: unknown): value is string {
  return typeof value === "string" && PROVIDER_ID_RE.test(value);
}

/** Roles someone joining through SSO can get; never owner, admin or billing. */
export const SSO_JOIN_ROLES = ["member", "viewer"] as const;
export type SsoJoinRole = (typeof SSO_JOIN_ROLES)[number];
export const DEFAULT_SSO_JOIN_ROLE: SsoJoinRole = "member";

export function isSsoJoinRole(value: unknown): value is SsoJoinRole {
  return (
    typeof value === "string" &&
    (SSO_JOIN_ROLES as readonly string[]).includes(value)
  );
}

/** Key in the workspace's metadata (organization.metadata, JSON). */
export const SSO_ROLE_METADATA_KEY = "ssoJoinRole";

/** Parsed workspace metadata (Better Auth stores it as a JSON string). */
export function parseWorkspaceMetadata(
  metadata: unknown
): Record<string, unknown> {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The role new SSO members get, from the workspace's metadata. */
export function ssoJoinRoleFromMetadata(metadata: unknown): SsoJoinRole {
  const role = parseWorkspaceMetadata(metadata)[SSO_ROLE_METADATA_KEY];
  return isSsoJoinRole(role) ? role : DEFAULT_SSO_JOIN_ROLE;
}

const MAX_DOMAIN_LENGTH = 253;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^xn--[a-z0-9-]+$/;

/**
 * The email domain as stored ("acme.com"), or null when it isn't one. Takes
 * "acme.com", "ACME.com.", "@acme.com" or "ana@acme.com"; refuses IP
 * addresses, ports, wildcards, single labels and lists.
 */
export function normalizeSsoDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at !== -1) value = value.slice(at + 1);
  value = value.replace(/\.$/, "");
  if (!value || value.length > MAX_DOMAIN_LENGTH) return null;
  const labels = value.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL_RE.test(label))) return null;
  const tld = labels.at(-1) ?? "";
  if (!TLD_RE.test(tld)) return null;
  return value;
}

/** The domain of an email address, lower case, or null. */
export function emailDomain(email: string): string | null {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0]) return null;
  return normalizeSsoDomain(parts[1] ?? "");
}

/** True when `domain` is `connectionDomain` or one of its subdomains. */
export function domainCovers(
  connectionDomain: string,
  domain: string
): boolean {
  const a = connectionDomain.toLowerCase();
  const b = domain.toLowerCase();
  return b === a || b.endsWith(`.${a}`);
}

/** True when an address belongs to the connection's domain. */
export function emailInSsoDomain(email: string, connectionDomain: string) {
  const domain = emailDomain(email);
  return domain !== null && domainCovers(connectionDomain, domain);
}

/** True when either domain covers the other (so both can't be verified). */
export function domainsOverlap(a: string, b: string): boolean {
  return domainCovers(a, b) || domainCovers(b, a);
}

/** The TXT record that proves a connection's domain. */
export function ssoVerificationRecord(
  providerId: string,
  domain: string,
  token: string
): { type: "TXT"; name: string; value: string } {
  return {
    type: "TXT",
    name: `_${SSO_TOKEN_PREFIX}-${providerId}.${domain}`,
    value: token,
  };
}

export interface SsoServiceProviderUrls {
  /** OIDC: the redirect (callback) URI to register at the IdP */
  oidcRedirectUri: string;
  /** SAML: Assertion Consumer Service URL (HTTP-POST) */
  samlAcsUrl: string;
  /** SAML: QRdx's entity ID (audience) for this connection */
  samlEntityId: string;
  /** SAML: QRdx's metadata for this connection */
  samlMetadataUrl: string;
}

/** What the admin pastes into their IdP, from the app's public URL. */
export function ssoServiceProviderUrls(
  appUrl: string,
  providerId: string
): SsoServiceProviderUrls {
  const base = `${new URL(appUrl).origin}${AUTH_BASE_PATH}`;
  const id = encodeURIComponent(providerId);
  const metadata = `${base}/sso/saml2/sp/metadata?providerId=${id}`;
  return {
    oidcRedirectUri: `${base}/sso/callback/${id}`,
    samlAcsUrl: `${base}/sso/saml2/sp/acs/${id}`,
    samlEntityId: metadata,
    samlMetadataUrl: metadata,
  };
}

const SIGN_IN_PATH = "/sign-in";

/**
 * Where a failed SSO sign-in should land: the sign-in page with the error
 * code and the page the person was going to, like an OIDC failure (which
 * goes to the errorCallbackURL the panel sets). The plugin sends some SAML
 * failures (an account it can't link, for one) to the success URL instead,
 * and some to its own /error page. Null when `location` carries no error or
 * already goes to the sign-in page.
 */
export function ssoFailureRedirect(
  location: string | null | undefined,
  appOrigin: string
): string | null {
  if (!location) return null;
  let url: URL;
  try {
    url = new URL(location, appOrigin);
  } catch {
    return null;
  }
  const error = url.searchParams.get("error");
  if (!error) return null;
  const sameSite = url.origin === new URL(appOrigin).origin;
  if (sameSite && url.pathname === SIGN_IN_PATH) return null;
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  // Only a page of the app, never the auth API or another site.
  const next =
    sameSite && !url.pathname.startsWith(AUTH_BASE_PATH)
      ? `${url.pathname}${url.search}`
      : null;
  const target = new URLSearchParams();
  if (next) target.set("next", next);
  target.set("error", error.replaceAll(" ", "_"));
  return `${SIGN_IN_PATH}?${target}`;
}
