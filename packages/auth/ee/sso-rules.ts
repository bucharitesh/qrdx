// Workspace single sign-on: pure and client-safe. The SSO plugin's gate
// (./sso.ts), the app's server actions and settings page
// (apps/docs/ee/sso/*, app/dashboard/[workspace]/settings/sso) and tests
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

/** Error codes QRdx sends back for SSO sign-ins (apps/docs/ee/sso/messages.ts). */
export const SSO_SIGN_IN_ERROR = {
  outsideDomain: "sso_email_outside_domain",
  emailUnverified: "sso_email_unverified",
  emailMissing: "sso_email_missing",
  weakSignature: "sso_weak_signature",
} as const;

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

// ---- What the identity provider sends ----

/**
 * True when a claim or attribute value says "not verified" outright: false,
 * 0, "false" or "0" (any one value of a list). Absent, true and anything
 * else is not a "no".
 */
export function saysNotVerified(value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  return values.some(
    (entry) =>
      entry === false ||
      entry === 0 ||
      (typeof entry === "string" &&
        ["false", "0"].includes(entry.trim().toLowerCase()))
  );
}

/** SAML attributes some identity providers use for "email verified". */
const SAML_EMAIL_VERIFIED_ATTRIBUTES = ["email_verified", "emailVerified"];

/**
 * True when the identity provider explicitly says the address isn't
 * verified: OIDC's email_verified claim, or a SAML email-verified attribute.
 * Providers that don't say either way are trusted for the verified domain.
 */
export function ssoEmailUnverified(
  protocol: "oidc" | "saml",
  profile: Record<string, unknown> | null | undefined
): boolean {
  if (!profile) return false;
  if (protocol === "oidc") return saysNotVerified(profile.email_verified);
  return SAML_EMAIL_VERIFIED_ATTRIBUTES.some((name) =>
    saysNotVerified(profile[name])
  );
}

/** True for something shaped like an email address (one @, text around it). */
export function looksLikeEmail(value: unknown): boolean {
  return (
    typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

// SAML attribute names for a person's name: friendly names, X.500 OIDs and
// other common spellings, in the order they're tried.
const SAML_GIVEN_NAME = ["givenName", "urn:oid:2.5.4.42", "firstName"];
const SAML_SURNAME = ["surname", "urn:oid:2.5.4.4", "lastName"];
const SAML_DISPLAY_NAME = [
  "displayName",
  "urn:oid:2.16.840.1.113730.3.1.241",
  "name",
];

function firstText(
  attributes: Record<string, unknown>,
  names: string[]
): string {
  for (const name of names) {
    const value = attributes[name];
    const values = Array.isArray(value) ? value : [value];
    const text = values.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim() !== ""
    );
    if (text) return text.trim();
  }
  return "";
}

/**
 * The person's name from SAML attributes (given name and surname, else a
 * display name), or "" when there's none. Never the NameID: that's often an
 * opaque id. With "", the account starts with the address's local part, like
 * an email sign-up.
 */
export function samlPersonName(
  attributes: Record<string, unknown> | null | undefined
): string {
  if (!attributes) return "";
  const full = [
    firstText(attributes, SAML_GIVEN_NAME),
    firstText(attributes, SAML_SURNAME),
  ]
    .filter(Boolean)
    .join(" ");
  return full || firstText(attributes, SAML_DISPLAY_NAME);
}

// ---- SAML signature algorithms ----

/** Signature algorithms QRdx accepts on SAML responses: SHA-256 or stronger. */
export const SAML_SIGNATURE_ALGORITHMS = [
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha384",
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
  "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256",
  "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384",
  "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512",
];

/** Digest algorithms QRdx accepts on SAML responses: SHA-256 or stronger. */
export const SAML_DIGEST_ALGORITHMS = [
  "http://www.w3.org/2001/04/xmlenc#sha256",
  "http://www.w3.org/2001/04/xmldsig-more#sha384",
  "http://www.w3.org/2001/04/xmlenc#sha512",
];

// A SignatureMethod or DigestMethod start tag (quoted values may hold ">"),
// then its Algorithm attribute.
const METHOD_TAG_RE =
  /<(?:[\w.-]+:)?(SignatureMethod|DigestMethod)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ALGORITHM_ATTRIBUTE_RE = /(?:^|\s)Algorithm\s*=\s*(["'])(.*?)\1/;

/**
 * Every signature or digest algorithm in a SAML response's XML that isn't
 * SHA-256 or stronger (SHA-1, for one), wherever it appears. Anything not on
 * the allowed lists counts, so an odd spelling is refused rather than let
 * through. Empty when all are allowed, or when the response isn't signed
 * (the plugin refuses that itself).
 */
export function samlWeakAlgorithms(xml: string): string[] {
  const weak = new Set<string>();
  for (const [, element, attributes] of xml.matchAll(METHOD_TAG_RE)) {
    const algorithm =
      attributes?.match(ALGORITHM_ATTRIBUTE_RE)?.[2]?.trim() ?? "";
    const allowed =
      element === "SignatureMethod"
        ? SAML_SIGNATURE_ALGORITHMS
        : SAML_DIGEST_ALGORITHMS;
    if (!allowed.includes(algorithm)) weak.add(algorithm || "(none)");
  }
  return [...weak];
}
