import "server-only";

import { X509Certificate } from "node:crypto";
import { lookup } from "node:dns/promises";
import { auth } from "@repo/auth/server";
import {
  discoverOidcEndpoints,
  unverifySsoDomain,
  verifiedDomainTakenElsewhere,
} from "@repo/auth/sso";
import {
  isSsoProviderId,
  newSsoProviderId,
  normalizeSsoDomain,
  parseWorkspaceMetadata,
  SSO_ROLE_METADATA_KEY,
  type SsoJoinRole,
  type SsoServiceProviderUrls,
  ssoJoinRoleFromMetadata,
  ssoServiceProviderUrls,
  ssoVerificationRecord,
} from "@repo/auth/sso-rules";
import { database as db } from "@repo/database";
import { HttpError } from "@/lib/error-response";
import { checkWebhookUrl, isBlockedAddress } from "@/lib/events/url-safety";
import { can } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";
import {
  getOwnerPlanForOrganization,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";

// Settings → Single sign-on. The plugin's management endpoints are off over
// HTTP (packages/auth/ee/sso.ts SSO_SERVER_ONLY_PATHS), so these functions,
// called by ee/sso/actions.ts and the settings page, are the only way in. Each
// checks the QRdx role (sso.manage), the Business plan and, for changes to
// the connection itself, a recent sign-in, before calling auth.api with the
// person's own session (the plugin then checks owner/admin again).

export type SsoProtocol = "oidc" | "saml";

export interface SsoConnectionView {
  providerId: string;
  protocol: SsoProtocol;
  domain: string;
  verified: boolean;
  /** OIDC issuer, or the SAML identity provider's entity ID */
  idpId: string;
  /** OIDC client ID, last four characters only */
  clientIdHint: string | null;
  /** SAML sign-in URL at the identity provider */
  samlSsoUrl: string | null;
  /** SAML signing certificate */
  certificate: { fingerprint: string; expiresAt: string } | null;
  /** SAML set up from metadata XML (changed by setting it up again) */
  fromMetadata: boolean;
  /** The TXT record that proves the domain (managers, while unverified) */
  record: { type: "TXT"; name: string; value: string } | null;
  urls: SsoServiceProviderUrls;
}

export interface SsoOverview {
  plan: Plan;
  /** The workspace's plan includes SSO */
  allowed: boolean;
  /** The viewer may change SSO (owner or admin) */
  canManage: boolean;
  joinRole: SsoJoinRole;
  connection: SsoConnectionView | null;
  /** The new connection's id and IdP values, for the set-up form */
  draft: { providerId: string; urls: SsoServiceProviderUrls };
}

type ProviderRow = {
  providerId: string;
  issuer: string;
  domain: string;
  domainVerified: boolean | null;
  oidcConfig: string | null;
  samlConfig: string | null;
};

function appUrl(): string {
  const url = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("BETTER_AUTH_URL is not set");
  return url;
}

function json(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const PEM_BODY_RE =
  /<(?:\w+:)?X509Certificate>\s*([^<]+?)\s*<\/(?:\w+:)?X509Certificate>/;
const ENTITY_ID_RE = /<(?:\w+:)?EntityDescriptor\b[^>]*\bentityID="([^"]+)"/;

function toPem(certificate: string): string {
  const trimmed = certificate.trim();
  if (trimmed.includes("-----BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

/** The certificate's SHA-256 fingerprint and expiry, or null when unreadable. */
export function describeCertificate(
  certificate: string,
): { fingerprint: string; expiresAt: string } | null {
  try {
    const cert = new X509Certificate(toPem(certificate));
    return {
      fingerprint: cert.fingerprint256,
      expiresAt: new Date(cert.validTo).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Entity ID and HTTP-Redirect sign-in URL from IdP metadata XML. */
export function readIdpMetadata(xml: string): {
  entityId: string | null;
  ssoUrl: string | null;
  certificate: string | null;
} {
  const entityId = xml.match(ENTITY_ID_RE)?.[1] ?? null;
  let ssoUrl: string | null = null;
  for (const tag of xml.match(/<(?:\w+:)?SingleSignOnService\b[^>]*>/g) ?? []) {
    const binding = tag.match(/\bBinding="([^"]+)"/)?.[1] ?? "";
    const location = tag.match(/\bLocation="([^"]+)"/)?.[1] ?? null;
    if (binding.endsWith(":HTTP-Redirect") && location) {
      ssoUrl = location.replaceAll("&amp;", "&");
      break;
    }
  }
  const certificate = xml.match(PEM_BODY_RE)?.[1] ?? null;
  return { entityId, ssoUrl, certificate };
}

const WANT_SIGNED_REQUESTS_RE =
  /(<(?:\w+:)?IDPSSODescriptor\b[^>]*?\bWantAuthnRequestsSigned\s*=\s*)(["'])(?:true|1)\2/g;

/**
 * IdP metadata as stored: QRdx has no SAML signing key and sends its sign-in
 * requests unsigned, but the SAML library refuses to build any request for an
 * identity provider whose metadata says WantAuthnRequestsSigned="true" (some
 * providers publish that for every app), so every sign-in failed. Stored as
 * "false"; the identity provider still decides whether to accept an unsigned
 * request (the docs say to turn off signed requests for QRdx there).
 */
export function withUnsignedSignInRequests(xml: string): string {
  return xml.replace(WANT_SIGNED_REQUESTS_RE, "$1$2false$2");
}

function toView(row: ProviderRow, token: string | null): SsoConnectionView {
  const oidc = json(row.oidcConfig);
  const saml = json(row.samlConfig);
  const urls = ssoServiceProviderUrls(appUrl(), row.providerId);
  const verified = Boolean(row.domainVerified);
  const record =
    !verified && token
      ? ssoVerificationRecord(row.providerId, row.domain, token)
      : null;
  if (saml) {
    const idp = (saml.idpMetadata ?? {}) as Record<string, unknown>;
    const metadata = str(idp.metadata);
    const fromXml = metadata ? readIdpMetadata(metadata) : null;
    const cert =
      str(idp.cert) ?? str(saml.cert) ?? fromXml?.certificate ?? null;
    return {
      providerId: row.providerId,
      protocol: "saml",
      domain: row.domain,
      verified,
      idpId: str(idp.entityID) ?? fromXml?.entityId ?? "",
      clientIdHint: null,
      samlSsoUrl: str(saml.entryPoint),
      certificate: cert ? describeCertificate(cert) : null,
      fromMetadata: Boolean(metadata),
      record,
      urls,
    };
  }
  const clientId = str(oidc?.clientId);
  return {
    providerId: row.providerId,
    protocol: "oidc",
    domain: row.domain,
    verified,
    idpId: row.issuer,
    clientIdHint: clientId ? `…${clientId.slice(-4)}` : null,
    samlSsoUrl: null,
    certificate: null,
    fromMetadata: false,
    record,
    urls,
  };
}

async function findConnection(
  organizationId: string,
): Promise<ProviderRow | null> {
  const row = await db.query.ssoProvider.findFirst({
    columns: {
      providerId: true,
      issuer: true,
      domain: true,
      domainVerified: true,
      oidcConfig: true,
      samlConfig: true,
    },
    where: (table, { eq }) => eq(table.organizationId, organizationId),
  });
  return row ?? null;
}

async function workspaceMetadata(organizationId: string) {
  const row = await db.query.organization.findFirst({
    columns: { metadata: true },
    where: (table, { eq }) => eq(table.id, organizationId),
  });
  return parseWorkspaceMetadata(row?.metadata ?? null);
}

/** Better Auth's APIError, without importing it: status, code, message. */
function apiErrorParts(
  error: unknown,
): { status: number; code: string; message: string } | null {
  if (!error || typeof error !== "object" || !("body" in error)) return null;
  const { body, statusCode, status } = error as {
    body?: { code?: unknown; message?: unknown };
    statusCode?: unknown;
    status?: unknown;
  };
  return {
    status: typeof statusCode === "number" ? statusCode : Number(status) || 400,
    code: typeof body?.code === "string" ? body.code : "",
    message: typeof body?.message === "string" ? body.message : "",
  };
}

/** The active domain-verification token, created when there's none. */
async function verificationToken(
  providerId: string,
  requestHeaders: Headers,
): Promise<string | null> {
  try {
    const result = (await auth.api.requestDomainVerification({
      body: { providerId },
      headers: requestHeaders,
    })) as { domainVerificationToken?: string } | null;
    return result?.domainVerificationToken ?? null;
  } catch (error) {
    if (apiErrorParts(error)?.code === "DOMAIN_VERIFIED") return null;
    throw error;
  }
}

/** Everything the settings page shows, for the workspace in `scope`. */
export async function getSsoOverview(
  scope: ActiveScope,
  requestHeaders: Headers,
): Promise<SsoOverview> {
  const [plan, row, metadata] = await Promise.all([
    getOwnerPlanForOrganization(scope.organizationId),
    findConnection(scope.organizationId),
    workspaceMetadata(scope.organizationId),
  ]);
  const canManage = can(scope.role, "sso.manage");
  const draftId = newSsoProviderId();
  const token =
    row && canManage && !row.domainVerified
      ? await verificationToken(row.providerId, requestHeaders)
      : null;
  return {
    plan,
    allowed: getPlanLimits(plan).sso,
    canManage,
    joinRole: ssoJoinRoleFromMetadata(metadata),
    connection: row ? toView(row, token) : null,
    draft: {
      providerId: draftId,
      urls: ssoServiceProviderUrls(appUrl(), draftId),
    },
  };
}

// ---- Changes ----

export const SSO_LIMITS = {
  domain: 253,
  url: 2048,
  clientId: 512,
  clientSecret: 2048,
  certificate: 16_384,
  metadata: 100_000,
} as const;

export type CreateSsoInput = {
  /**
   * The id shown with the IdP values before saving (from getSsoOverview);
   * a fresh one is made when it's missing or malformed.
   */
  providerId?: string;
} & (
  | {
      protocol: "oidc";
      domain: string;
      issuer: string;
      clientId: string;
      clientSecret: string;
    }
  | {
      protocol: "saml";
      domain: string;
      /** IdP metadata XML, or the three fields below */
      metadataXml?: string;
      ssoUrl?: string;
      entityId?: string;
      certificate?: string;
    }
);

export type UpdateSsoInput =
  | { protocol: "oidc"; clientSecret: string }
  | { protocol: "saml"; certificate: string };

const fail = (status: number, code: string, message: string) =>
  new HttpError(status, code, message);

/** Role, plan and (for connection changes) a recent sign-in. */
async function guard(
  scope: ActiveScope,
  { needsPlan = true }: { needsPlan?: boolean } = {},
) {
  assertCan(scope, "sso.manage");
  if (needsPlan) {
    const plan = await getOwnerPlanForOrganization(scope.organizationId);
    if (!getPlanLimits(plan).sso) {
      throw fail(
        403,
        "PLAN_REQUIRED",
        "Single sign-on comes with the Business plan.",
      );
    }
  }
}

async function assertDomainFree(domain: string, organizationId: string) {
  if (await verifiedDomainTakenElsewhere(domain, organizationId)) {
    throw fail(
      409,
      "DOMAIN_TAKEN",
      `${domain} is already verified for single sign-on in another workspace.`,
    );
  }
}

/**
 * The issuer may be fetched: https on a public host name that doesn't
 * resolve to a private address. Origins the operator trusts
 * (BETTER_AUTH_TRUSTED_ORIGINS, e.g. an internal IdP) skip the check, as in
 * the plugin.
 */
async function assertPublicIssuer(
  issuer: string,
  isTrustedOrigin: (url: string) => boolean,
): Promise<void> {
  if (isTrustedOrigin(issuer)) return;
  const check = checkWebhookUrl(issuer);
  if (!check.ok) {
    throw fail(
      400,
      "VALIDATION_ERROR",
      check.message.replace("Webhook URLs", "Issuer URLs"),
    );
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(check.url.hostname, { all: true });
  } catch {
    throw fail(
      400,
      "VALIDATION_ERROR",
      `We couldn't find ${check.url.hostname}. Check the issuer URL.`,
    );
  }
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw fail(
      400,
      "VALIDATION_ERROR",
      "The issuer must be reachable on the public internet.",
    );
  }
}

function pluginFailure(error: unknown, fallback: string): HttpError {
  const parts = apiErrorParts(error);
  if (!parts)
    return error instanceof HttpError
      ? error
      : fail(500, "UNKNOWN_ERROR", fallback);
  return fail(
    parts.status >= 400 && parts.status < 500 ? parts.status : 502,
    "PROVIDER_ERROR",
    parts.message || fallback,
  );
}

function requireText(value: string | undefined, label: string, max: number) {
  const text = (value ?? "").trim();
  if (!text) throw fail(400, "VALIDATION_ERROR", `Enter the ${label}.`);
  if (text.length > max) {
    throw fail(400, "VALIDATION_ERROR", `The ${label} is too long.`);
  }
  return text;
}

/** A full http(s) URL, as typed: an OIDC issuer must match exactly. */
function requireUrl(value: string | undefined, label: string): string {
  const text = requireText(value, label, SSO_LIMITS.url);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error();
    return text;
  } catch {
    throw fail(400, "VALIDATION_ERROR", `Enter the ${label} as a full URL.`);
  }
}

function requireCertificate(value: string | undefined): string {
  const text = requireText(
    value,
    "signing certificate",
    SSO_LIMITS.certificate,
  );
  if (!describeCertificate(text)) {
    throw fail(
      400,
      "VALIDATION_ERROR",
      "That signing certificate couldn't be read. Paste the X.509 certificate (PEM or base64).",
    );
  }
  return toPem(text);
}

async function oidcBody(
  input: Extract<CreateSsoInput, { protocol: "oidc" }>,
): Promise<Record<string, unknown>> {
  const issuer = requireUrl(input.issuer, "issuer URL");
  const clientId = requireText(
    input.clientId,
    "client ID",
    SSO_LIMITS.clientId,
  );
  const clientSecret = requireText(
    input.clientSecret,
    "client secret",
    SSO_LIMITS.clientSecret,
  );
  const context = await auth.$context;
  const isTrustedOrigin = (url: string) => context.isTrustedOrigin(url);
  await assertPublicIssuer(issuer, isTrustedOrigin);
  const discoveryUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  let endpoints: Awaited<ReturnType<typeof discoverOidcEndpoints>>;
  try {
    // The IdP's endpoints may be on other public https hosts; the plugin
    // re-checks each resolved address before every server-side fetch.
    endpoints = await discoverOidcEndpoints(
      issuer,
      isTrustedOrigin,
      (url) => checkWebhookUrl(url).ok,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw fail(
      400,
      "DISCOVERY_FAILED",
      `We couldn't read ${discoveryUrl}. Check the issuer URL. ${message}`.trim(),
    );
  }
  return {
    issuer: endpoints.issuer,
    oidcConfig: {
      clientId,
      clientSecret,
      skipDiscovery: true,
      pkce: true,
      scopes: ["openid", "email", "profile"],
      discoveryEndpoint: endpoints.discoveryEndpoint,
      authorizationEndpoint: endpoints.authorizationEndpoint,
      tokenEndpoint: endpoints.tokenEndpoint,
      jwksEndpoint: endpoints.jwksEndpoint,
      userInfoEndpoint: endpoints.userInfoEndpoint,
      tokenEndpointAuthentication: endpoints.tokenEndpointAuthentication,
    },
  };
}

const EMAIL_NAME_ID = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

function samlBody(
  input: Extract<CreateSsoInput, { protocol: "saml" }>,
  urls: SsoServiceProviderUrls,
): Record<string, unknown> {
  const xml = input.metadataXml?.trim();
  if (xml) {
    if (xml.length > SSO_LIMITS.metadata) {
      throw fail(400, "VALIDATION_ERROR", "That metadata file is too large.");
    }
    const metadata = readIdpMetadata(xml);
    if (!metadata.entityId) {
      throw fail(
        400,
        "VALIDATION_ERROR",
        "That doesn't look like SAML identity provider metadata (no entityID).",
      );
    }
    if (!metadata.ssoUrl) {
      throw fail(
        400,
        "VALIDATION_ERROR",
        "The metadata has no HTTP-Redirect sign-in URL (SingleSignOnService).",
      );
    }
    if (!(metadata.certificate && describeCertificate(metadata.certificate))) {
      throw fail(
        400,
        "VALIDATION_ERROR",
        "The metadata has no readable signing certificate.",
      );
    }
    return {
      issuer: urls.samlEntityId,
      samlConfig: {
        entryPoint: metadata.ssoUrl,
        idpMetadata: { metadata: withUnsignedSignInRequests(xml) },
        identifierFormat: EMAIL_NAME_ID,
      },
    };
  }
  const entryPoint = requireUrl(input.ssoUrl, "sign-in URL");
  const entityId = requireText(input.entityId, "entity ID", SSO_LIMITS.url);
  const cert = requireCertificate(input.certificate);
  return {
    issuer: urls.samlEntityId,
    samlConfig: {
      entryPoint,
      cert,
      idpMetadata: { entityID: entityId, cert },
      identifierFormat: EMAIL_NAME_ID,
    },
  };
}

/** Sets up the workspace's connection (unverified until its domain is). */
export async function createSsoConnection(
  scope: ActiveScope,
  requestHeaders: Headers,
  input: CreateSsoInput,
): Promise<SsoConnectionView> {
  await guard(scope);
  if (await findConnection(scope.organizationId)) {
    throw fail(
      409,
      "ALREADY_EXISTS",
      "This workspace already has a single sign-on connection. Remove it to set up another.",
    );
  }
  const domain = normalizeSsoDomain(input.domain ?? "");
  if (!domain) {
    throw fail(
      400,
      "VALIDATION_ERROR",
      "Enter your email domain, like acme.com.",
    );
  }
  await assertDomainFree(domain, scope.organizationId);

  // The plugin refuses an id that's already taken.
  const providerId = isSsoProviderId(input.providerId)
    ? input.providerId
    : newSsoProviderId();
  const urls = ssoServiceProviderUrls(appUrl(), providerId);
  const protocolBody =
    input.protocol === "oidc" ? await oidcBody(input) : samlBody(input, urls);
  try {
    await auth.api.registerSSOProvider({
      body: {
        providerId,
        domain,
        organizationId: scope.organizationId,
        ...protocolBody,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    throw pluginFailure(error, "We couldn't save the connection.");
  }
  const row = await findConnection(scope.organizationId);
  if (!row)
    throw fail(500, "UNKNOWN_ERROR", "We couldn't save the connection.");
  return toView(row, await verificationToken(providerId, requestHeaders));
}

function existingOrThrow(row: ProviderRow | null): ProviderRow {
  if (!row) {
    throw fail(
      404,
      "NOT_FOUND",
      "This workspace has no single sign-on connection.",
    );
  }
  return row;
}

/**
 * Checks the DNS record. One verified domain belongs to one workspace: an
 * overlapping domain verified elsewhere first wins.
 */
export async function verifySsoDomain(
  scope: ActiveScope,
  requestHeaders: Headers,
): Promise<SsoConnectionView> {
  await guard(scope);
  const row = existingOrThrow(await findConnection(scope.organizationId));
  if (row.domainVerified) return toView(row, null);
  await assertDomainFree(row.domain, scope.organizationId);
  try {
    await auth.api.verifyDomain({
      body: { providerId: row.providerId },
      headers: requestHeaders,
    });
  } catch (error) {
    const parts = apiErrorParts(error);
    const record = ssoVerificationRecord(row.providerId, row.domain, "");
    if (parts?.code === "DOMAIN_VERIFICATION_FAILED") {
      throw fail(
        422,
        "NOT_VERIFIED",
        `We didn't find the TXT record at ${record.name} yet. New records can take a few minutes, sometimes longer, to show up. Try again soon.`,
      );
    }
    if (parts?.code === "NO_PENDING_VERIFICATION") {
      throw fail(
        422,
        "RECORD_EXPIRED",
        "The verification value expired. Reload the page for a new one and update the TXT record.",
      );
    }
    throw pluginFailure(error, "We couldn't check the domain.");
  }
  // Two workspaces verifying overlapping domains at the same moment.
  if (await verifiedDomainTakenElsewhere(row.domain, scope.organizationId)) {
    await unverifySsoDomain(row.providerId);
    await assertDomainFree(row.domain, scope.organizationId);
  }
  return toView({ ...row, domainVerified: true }, null);
}

/** Replaces the OIDC client secret or the SAML signing certificate. */
export async function updateSsoConnection(
  scope: ActiveScope,
  requestHeaders: Headers,
  input: UpdateSsoInput,
): Promise<SsoConnectionView> {
  await guard(scope);
  const row = existingOrThrow(await findConnection(scope.organizationId));
  const isSaml = Boolean(row.samlConfig);
  if ((input.protocol === "saml") !== isSaml) {
    throw fail(400, "VALIDATION_ERROR", "That doesn't match this connection.");
  }
  let body: Record<string, unknown>;
  if (input.protocol === "oidc") {
    body = {
      oidcConfig: {
        clientSecret: requireText(
          input.clientSecret,
          "client secret",
          SSO_LIMITS.clientSecret,
        ),
      },
    };
  } else {
    const cert = requireCertificate(input.certificate);
    const saml = json(row.samlConfig) ?? {};
    const idp = (saml.idpMetadata ?? {}) as Record<string, unknown>;
    if (str(idp.metadata)) {
      throw fail(
        400,
        "VALIDATION_ERROR",
        "This connection was set up from metadata. Remove it and set it up again with the new metadata.",
      );
    }
    body = { samlConfig: { cert, idpMetadata: { cert } } };
  }
  try {
    await auth.api.updateSSOProvider({
      body: { providerId: row.providerId, ...body },
      headers: requestHeaders,
    });
  } catch (error) {
    throw pluginFailure(error, "We couldn't update the connection.");
  }
  const updated = existingOrThrow(await findConnection(scope.organizationId));
  return toView(updated, null);
}

/**
 * Removes the connection and everyone's link to it. Members stay in the
 * workspace and sign in another way. Works on any plan.
 */
export async function deleteSsoConnection(
  scope: ActiveScope,
  requestHeaders: Headers,
): Promise<{ domain: string }> {
  await guard(scope, { needsPlan: false });
  const row = existingOrThrow(await findConnection(scope.organizationId));
  try {
    await auth.api.deleteSSOProvider({
      body: { providerId: row.providerId },
      headers: requestHeaders,
    });
  } catch (error) {
    throw pluginFailure(error, "We couldn't remove the connection.");
  }
  return { domain: row.domain };
}

/** The role people get when they first sign in with SSO. */
export async function setSsoJoinRole(
  scope: ActiveScope,
  requestHeaders: Headers,
  role: SsoJoinRole,
): Promise<SsoJoinRole> {
  await guard(scope, { needsPlan: false });
  const metadata = await workspaceMetadata(scope.organizationId);
  try {
    await auth.api.updateOrganization({
      body: {
        organizationId: scope.organizationId,
        data: { metadata: { ...metadata, [SSO_ROLE_METADATA_KEY]: role } },
      },
      headers: requestHeaders,
    });
  } catch (error) {
    throw pluginFailure(error, "We couldn't save the role.");
  }
  return role;
}
