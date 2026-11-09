// "Require single sign-on for <domain>": the pure, client-safe rules, shared
// by the plugin side (./sso-required.ts), the app's settings and sign-in
// screens (apps/docs/ee/sso) and tests.
//
// A workspace turns it on for its verified connection. From then on, for an
// address in that domain (or a subdomain), only that connection signs in:
// email codes, Google, GitHub and "Continue with passkey" are refused, the
// second step after SSO still applies, and a session lasts at most
// SSO_SESSION_HOURS, so someone removed in the identity provider is cut off
// within a day. The workspace's owners are exempt (break-glass): they keep
// their other sign-in methods, so a broken identity provider can't lock
// everyone out of the setting.

import { fieldHoldsRole } from "../workspace-role-rules";
import { parseWorkspaceMetadata } from "./sso-rules";

/**
 * Key in the workspace's metadata (organization.metadata, JSON). Its value is
 * the connection's providerId, so it applies to that connection only: a
 * connection that's removed and set up again starts with it off.
 */
export const SSO_REQUIRED_METADATA_KEY = "ssoRequired";

/** The connection the workspace requires SSO for, from its metadata. */
export function ssoRequiredProviderId(metadata: unknown): string | null {
  const value = parseWorkspaceMetadata(metadata)[SSO_REQUIRED_METADATA_KEY];
  return typeof value === "string" && value ? value : null;
}

/** Sign-ins refused because the address's domain requires SSO. */
export const SSO_REQUIRED_ERROR = "sso_required";

/** A session of someone SSO is required for lasts at most this long. */
export const SSO_SESSION_HOURS = 24;
export const SSO_SESSION_MS = SSO_SESSION_HOURS * 60 * 60 * 1000;

/**
 * A session that came from an SSO sign-in has a `verification` row named by
 * this prefix and the session's id, holding {userId, providerId}, for
 * SSO_SESSION_HOURS from the sign-in. That's how QRdx tells SSO sessions
 * from the rest without a schema change: while SSO is required, a session
 * without a live one ends.
 */
export const SSO_SESSION_IDENTIFIER_PREFIX = "qrdx-sso-session-";

export function ssoSessionIdentifier(sessionId: string): string {
  return `${SSO_SESSION_IDENTIFIER_PREFIX}${sessionId}`;
}

/**
 * When an SSO sign-in is challenged for two-step verification, the challenge
 * (the twoFactor plugin's `2fa-<id>` row) gets a row named by this prefix and
 * its identifier, so the session made when the second step is done counts as
 * SSO too. Lives as long as the challenge.
 */
export const SSO_CHALLENGE_IDENTIFIER_PREFIX = "qrdx-sso-challenge-";

export function ssoChallengeIdentifier(challengeId: string): string {
  return `${SSO_CHALLENGE_IDENTIFIER_PREFIX}${challengeId}`;
}

/** The twoFactor plugin's challenge rows ("2fa-<random>"), not its counters. */
export function isChallengeIdentifier(identifier: unknown): boolean {
  return (
    typeof identifier === "string" &&
    identifier.startsWith("2fa-") &&
    !identifier.startsWith("2fa-attempts-")
  );
}

/** Who signed in through which connection: an SSO marker's value. */
export interface SsoMarker {
  userId: string;
  providerId: string;
}

export function ssoMarkerValue(marker: SsoMarker): string {
  return JSON.stringify({
    userId: marker.userId,
    providerId: marker.providerId,
  });
}

export function parseSsoMarker(value: unknown): SsoMarker | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<SsoMarker>;
    if (
      typeof parsed.userId === "string" &&
      typeof parsed.providerId === "string"
    ) {
      return { userId: parsed.userId, providerId: parsed.providerId };
    }
  } catch {
    // Not one of ours.
  }
  return null;
}

/**
 * True when a member's role field holds the owner role, matched exactly
 * (../workspace-role-rules.ts): " owner" is no owner.
 */
export function holdsOwnerRole(role: string | null | undefined): boolean {
  return fieldHoldsRole(role, "owner");
}

/**
 * "eu.acme.com" → ["eu.acme.com", "acme.com"]: the connection domains that
 * could cover an address there (a connection covers its subdomains).
 */
export function coveringDomains(domain: string): string[] {
  const labels = domain.toLowerCase().split(".");
  const found: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) {
    found.push(labels.slice(i).join("."));
  }
  return found;
}

/** How a new session is being made, for sessionCreationVerdict. */
export interface SessionCreation {
  /** The connection's id when this is its OIDC callback or SAML ACS */
  ssoCallbackProviderId: string | null;
  /** This finishes a two-step challenge (a code, a passkey, a trusted device) */
  completesChallenge: boolean;
  /** The SSO marker of the challenge it finishes, when it has one */
  challengeMarker: SsoMarker | null;
  /** A server-side call (auth.api), not an HTTP request */
  serverSide: boolean;
  /** The live SSO marker of the session the request already holds */
  currentSessionMarker: (SsoMarker & { expiresAt: Date }) | null;
}

/**
 * Whether someone SSO is required for may get a new session, and if so
 * whether it counts as SSO:
 * - the required connection's own callback: yes;
 * - finishing a two-step challenge that an SSO sign-in through it started:
 *   yes (the second step after SSO still applies);
 * - the app's own server-side calls that swap the session it already has
 *   (turning two-step verification on or off): only when that session came
 *   from SSO, and the new one keeps its marker (and so its end);
 * - anything else (email codes, Google, GitHub, a passkey sign-in, another
 *   connection, a challenge an email code started): refused.
 */
export function sessionCreationVerdict(
  creation: SessionCreation,
  userId: string,
  providerId: string
): "sso" | "carry" | "refuse" {
  if (creation.ssoCallbackProviderId !== null) {
    return creation.ssoCallbackProviderId === providerId ? "sso" : "refuse";
  }
  if (creation.completesChallenge) {
    const marker = creation.challengeMarker;
    return marker?.userId === userId && marker.providerId === providerId
      ? "sso"
      : "refuse";
  }
  const current = creation.currentSessionMarker;
  if (
    creation.serverSide &&
    current?.userId === userId &&
    current.providerId === providerId
  ) {
    return "carry";
  }
  return "refuse";
}

/**
 * Whether an email change may go ahead: never onto or off a domain that
 * requires SSO for the person (an owner of the requiring workspace is
 * exempt). The way into such a domain is signing in with SSO, which makes
 * or links the account for that address.
 */
export type EmailChangeSsoProblem =
  | { kind: "off"; domain: string }
  | { kind: "onto"; domain: string };
