// Every endpoint on QRdx's auth, classified for two-step verification. The
// challenge (packages/auth/sign-in-challenge.ts) runs after ANY endpoint that
// creates a session, so an unlisted sign-in path is challenged by default;
// this test makes sure nobody adds a plugin without deciding what each new
// path does. Adding a plugin fails here until its paths are listed below.
import {
  CHALLENGE_CODE_PATHS,
  CHALLENGE_COMPLETION_PATHS,
  CHALLENGE_CONTINUE_PATH,
  PASSKEY_SIGN_IN_PATH,
  SERVER_ONLY_TWO_FACTOR_PATHS,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import { afterEach, describe, expect, it, vi } from "vitest";

type Kind =
  /** Signs someone in (creates a session): challenged when 2FA is on. */
  | "challenged"
  /** Finishes a challenge, so it creates the session itself. */
  | "finishes-challenge"
  /** Passkey sign-in: challenged unless the authenticator verified the user. */
  | "challenged-without-uv"
  /**
   * Re-issues the session the request came with (same token): the challenge
   * skips it, nothing new is reached.
   */
  | "same-session"
  /**
   * Off over HTTP; only the app calls it, through auth.api (not a request),
   * which the challenge skips.
   */
  | "server-only"
  /** Never creates a session. */
  | "no-session";

const PATHS: Record<string, [Kind, string]> = {
  // Sign-ins
  "/sign-in/email-otp": ["challenged", "email code"],
  "/callback/:id": ["challenged", "Google and GitHub (GET and form POST)"],
  "/sign-in/social": ["challenged", "with an idToken it signs in directly"],
  "/sign-in/email": ["challenged", "passwords are off; would be challenged"],
  "/sign-up/email": ["challenged", "passwords are off; would be challenged"],
  "/verify-email": ["challenged", "auto sign-in after verifying, if enabled"],
  "/email-otp/verify-email": [
    "challenged",
    "off over HTTP; signs in if called",
  ],
  "/passkey/verify-registration": [
    "server-only",
    "createSession: true would make a session; adding a passkey needs a current code with 2FA on",
  ],
  "/admin/impersonate-user": ["challenged", "off over HTTP"],
  "/admin/stop-impersonating": [
    "challenged",
    "restores the admin's session; impersonation is off",
  ],
  [PASSKEY_SIGN_IN_PATH]: ["challenged-without-uv", "passkey sign-in"],
  "/two-factor/verify-totp": ["finishes-challenge", "authenticator code"],
  "/two-factor/verify-backup-code": ["finishes-challenge", "backup code"],
  "/two-factor/verify-otp": ["finishes-challenge", "off: no email/SMS codes"],
  "/two-factor/continue": [
    "finishes-challenge",
    "trusted device only (GET after a SAML POST); else the challenge page",
  ],

  // The session the request came with, re-issued (same token)
  "/get-session": ["same-session", "refreshes the session's expiry"],
  "/update-session": ["same-session", "same session"],
  "/update-user": ["same-session", "same session, new user data"],
  "/change-email": ["same-session", "same session"],
  "/email-otp/change-email": [
    "server-only",
    "same session; changing the email needs a current code with 2FA on",
  ],
  "/change-password": [
    "challenged",
    "passwords are off; a new session would be challenged",
  ],
  "/organization/set-active": ["same-session", "same session"],
  "/organization/create": ["same-session", "sets the new workspace active"],
  "/organization/delete": ["same-session", "clears the active workspace"],
  "/organization/accept-invitation": ["same-session", "sets it active"],
  "/organization/leave": ["same-session", "clears the active workspace"],
  "/organization/remove-member": ["same-session", "may clear it"],
  "/two-factor/enable": ["server-only", "rotates the session"],
  "/two-factor/disable": ["server-only", "rotates the session"],

  // No session created
  "/account-info": ["no-session", "read"],
  "/admin/ban-user": ["no-session", "admin"],
  "/admin/create-user": ["no-session", "admin"],
  "/admin/get-user": ["no-session", "admin"],
  "/admin/has-permission": ["no-session", "admin"],
  "/admin/list-user-sessions": ["no-session", "admin"],
  "/admin/list-users": ["no-session", "admin"],
  "/admin/remove-user": ["no-session", "admin"],
  "/admin/revoke-user-session": ["no-session", "admin"],
  "/admin/revoke-user-sessions": ["no-session", "admin"],
  "/admin/set-role": ["no-session", "admin"],
  "/admin/set-user-password": ["no-session", "off over HTTP"],
  "/admin/unban-user": ["no-session", "admin"],
  "/admin/update-user": ["no-session", "admin"],
  "/delete-user": ["no-session", "deletes"],
  "/delete-user/callback": ["no-session", "deletes"],
  "/email-otp/check-verification-otp": ["no-session", "off over HTTP"],
  "/email-otp/request-email-change": ["no-session", "sends a code"],
  "/email-otp/request-password-reset": ["no-session", "off over HTTP"],
  "/email-otp/reset-password": ["no-session", "off over HTTP"],
  "/email-otp/send-verification-otp": ["no-session", "sends a code"],
  "/error": ["no-session", "error page"],
  "/forget-password/email-otp": ["no-session", "off over HTTP"],
  "/get-access-token": ["no-session", "provider tokens"],
  "/link-social": ["no-session", "links to the current account"],
  "/list-accounts": ["no-session", "read"],
  "/list-sessions": ["no-session", "read"],
  "/ok": ["no-session", "health"],
  "/organization/cancel-invitation": ["no-session", "workspace"],
  "/organization/check-slug": ["no-session", "workspace"],
  "/organization/get-active-member": ["no-session", "workspace"],
  "/organization/get-active-member-role": ["no-session", "workspace"],
  "/organization/get-full-organization": ["no-session", "workspace"],
  "/organization/get-invitation": ["no-session", "workspace"],
  "/organization/get-organization": ["no-session", "workspace"],
  "/organization/has-permission": ["no-session", "workspace"],
  "/organization/invite-member": ["no-session", "workspace"],
  "/organization/list": ["no-session", "workspace"],
  "/organization/list-invitations": ["no-session", "workspace"],
  "/organization/list-members": ["no-session", "workspace"],
  "/organization/list-user-invitations": ["no-session", "workspace"],
  "/organization/reject-invitation": ["no-session", "workspace"],
  "/organization/update": ["no-session", "workspace"],
  "/organization/update-member-role": ["no-session", "workspace"],
  "/passkey/delete-passkey": ["no-session", "passkey management"],
  "/passkey/generate-authenticate-options": ["no-session", "a challenge"],
  "/passkey/generate-register-options": ["no-session", "a challenge"],
  "/passkey/list-user-passkeys": ["no-session", "passkey management"],
  "/passkey/update-passkey": ["no-session", "passkey management"],
  "/refresh-token": ["no-session", "provider tokens"],
  "/request-password-reset": ["no-session", "passwords are off"],
  "/reset-password": ["no-session", "passwords are off"],
  "/reset-password/:token": ["no-session", "passwords are off"],
  "/revoke-other-sessions": ["no-session", "ends sessions"],
  "/revoke-session": ["no-session", "ends a session"],
  "/revoke-sessions": ["no-session", "ends sessions"],
  "/send-verification-email": ["no-session", "sends an email"],
  "/sign-out": ["no-session", "ends the session"],
  "/two-factor/generate-backup-codes": ["no-session", "server only"],
  "/two-factor/get-totp-uri": ["no-session", "server only"],
  "/two-factor/send-otp": ["no-session", "off: no email/SMS codes"],
  "/unlink-account": ["no-session", "account management"],
  "/verify-password": ["no-session", "passwords are off"],
};

// Workspace SSO (packages/auth/ee/sso.ts): registered only on servers with a
// licence key (packages/auth/ee-license.ts), so only expected there.
const SSO_PATHS: Record<string, [Kind, string]> = {
  "/sign-in/sso": ["no-session", "starts SSO; the callback signs in"],
  "/sso/callback": ["challenged", "workspace SSO, OIDC shared callback"],
  "/sso/callback/:providerId": ["challenged", "workspace SSO, OIDC"],
  "/sso/saml2/sp/acs/:providerId": ["challenged", "workspace SSO, SAML"],
  "/sso/delete-provider": ["no-session", "SSO management"],
  "/sso/get-provider": ["no-session", "SSO management"],
  "/sso/providers": ["no-session", "SSO management"],
  "/sso/register": ["no-session", "SSO management"],
  "/sso/request-domain-verification": ["no-session", "SSO management"],
  "/sso/saml2/logout/:providerId": ["no-session", "SAML logout"],
  "/sso/saml2/sp/metadata": ["no-session", "SAML metadata"],
  "/sso/saml2/sp/slo/:providerId": ["no-session", "SAML logout"],
  "/sso/update-provider": ["no-session", "SSO management"],
  "/sso/verify-domain": ["no-session", "SSO management"],
};

async function loadAuth() {
  const { auth } = await import("@repo/auth/server");
  return auth as {
    api: Record<string, { path?: string }>;
    options: {
      disabledPaths?: string[];
      plugins?: { id: string }[];
      rateLimit?: { customRules?: Record<string, unknown> };
      session?: { cookieCache?: { enabled?: boolean } };
    };
  };
}

/** The auth server loaded fresh, with or without the ee/ licence key. */
async function loadAuthWith(license: string | undefined) {
  vi.resetModules();
  vi.stubEnv("QRDX_EE_LICENSE", license);
  return loadAuth();
}

describe("sign-in challenge coverage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["with", "test-license"],
    ["without", undefined],
  ])(
    "classifies every endpoint path QRdx's auth registers %s a licence key",
    async (_, license) => {
      const auth = await loadAuthWith(license);
      const expected = license ? { ...PATHS, ...SSO_PATHS } : PATHS;
      const registered = [
        ...new Set(
          Object.values(auth.api)
            .map((endpoint) => endpoint.path)
            .filter((p): p is string => typeof p === "string"),
        ),
      ].sort();
      const unclassified = registered.filter(
        (p) => !(p in PATHS || p in SSO_PATHS),
      );
      expect(
        unclassified,
        "New auth endpoints: classify each in tests/auth/sign-in-challenge-guard.test.ts (and check the challenge covers it)",
      ).toEqual([]);
      // Nothing listed that no longer exists, so the list stays honest.
      expect(
        Object.keys(expected).filter((p) => !registered.includes(p)),
      ).toEqual([]);
      // SSO is registered with a key and absent without one.
      expect(registered.filter((p) => p in SSO_PATHS).sort()).toEqual(
        license ? Object.keys(SSO_PATHS).sort() : [],
      );
    },
  );

  it("matches the challenge plugin's exemptions", () => {
    const finishes = Object.entries({ ...PATHS, ...SSO_PATHS })
      .filter(([, [kind]]) => kind === "finishes-challenge")
      .map(([p]) => p)
      .filter((p) => !UNUSED_TWO_FACTOR_PATHS.includes(p));
    expect(finishes.sort()).toEqual([...CHALLENGE_COMPLETION_PATHS].sort());
    expect(PATHS[PASSKEY_SIGN_IN_PATH][0]).toBe("challenged-without-uv");
  });

  it("keeps every server-only path off over HTTP", async () => {
    // The challenge skips auth.api calls, so these must not be reachable
    // by a request.
    const auth = await loadAuth();
    const disabled = auth.options.disabledPaths ?? [];
    const serverOnly = Object.entries(PATHS)
      .filter(([, [kind]]) => kind === "server-only")
      .map(([p]) => p);
    expect(serverOnly.filter((p) => !disabled.includes(p))).toEqual([]);
  });

  it("never serves sessions from a cookie cache", async () => {
    // The challenge deletes the session a sign-in made, and "Sign out
    // everywhere else" and the admin reset delete sessions too. A cookie
    // cache would keep a deleted session alive until it expired.
    const auth = await loadAuth();
    expect(auth.options.session?.cookieCache?.enabled).not.toBe(true);
  });

  it("registers the challenge right after the twoFactor plugin", async () => {
    const auth = await loadAuth();
    const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids[ids.indexOf("two-factor") + 1]).toBe("qrdx-sign-in-challenge");
  });

  it("keeps 2FA management off HTTP and the challenge rate-limited", async () => {
    const auth = await loadAuth();
    const disabled = auth.options.disabledPaths ?? [];
    for (const p of [
      ...SERVER_ONLY_TWO_FACTOR_PATHS,
      ...UNUSED_TWO_FACTOR_PATHS,
    ]) {
      expect(disabled).toContain(p);
    }
    for (const p of CHALLENGE_COMPLETION_PATHS) {
      expect(disabled).not.toContain(p);
    }
    for (const p of CHALLENGE_CODE_PATHS) {
      expect(auth.options.rateLimit?.customRules?.[p]).toEqual({
        window: 10,
        max: 3,
      });
    }
    // Checks signed cookies, no codes; once per SAML sign-in.
    expect(
      auth.options.rateLimit?.customRules?.[CHALLENGE_CONTINUE_PATH],
    ).toEqual({ window: 60, max: 120 });
  });
});
