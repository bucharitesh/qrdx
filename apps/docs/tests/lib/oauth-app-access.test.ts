// Ownership of self-serve OAuth apps (lib/oauth-apps/access.ts) and the
// authorization-request checks that use the app's settings
// (lib/oauth-apps/authorize.ts). Nothing here touches a database.
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({ database: {} }));

import {
  canEditOAuthApp,
  canManageOAuthApps,
  isAppInScope,
  isFirstPartyApp,
  isTrustedApp,
} from "@/lib/oauth-apps/access";
import {
  authorizeParamEntries,
  checkAuthorizeApp,
  checkAuthorizeParams,
  readAuthorizeParams,
  redirectWith,
} from "@/lib/oauth-apps/authorize";

const alice = "user_alice";
const bob = "user_bob";
const acme = "org_acme";
const other = "org_other";

const personal = (userId: string) => ({
  userId,
  organizationId: null,
  role: "owner" as const,
});
const team = (
  userId: string,
  organizationId: string,
  role: "owner" | "admin" | "member",
) => ({ userId, organizationId, role });

const alicePersonalApp = { ownerUserId: alice, organizationId: null };
const acmeApp = { ownerUserId: alice, organizationId: acme };
const firstPartyApp = { ownerUserId: null, organizationId: null };

describe("isAppInScope", () => {
  it("personal apps belong to their owner's personal workspace only", () => {
    expect(isAppInScope(personal(alice), alicePersonalApp)).toBe(true);
    expect(isAppInScope(personal(bob), alicePersonalApp)).toBe(false);
    expect(isAppInScope(team(alice, acme, "owner"), alicePersonalApp)).toBe(
      false,
    );
  });

  it("team apps belong to the team, whoever created them", () => {
    expect(isAppInScope(team(bob, acme, "member"), acmeApp)).toBe(true);
    expect(isAppInScope(team(alice, other, "owner"), acmeApp)).toBe(false);
    // The creator's personal workspace doesn't see the team's app.
    expect(isAppInScope(personal(alice), acmeApp)).toBe(false);
  });

  it("first-party apps belong to no workspace", () => {
    expect(isFirstPartyApp(firstPartyApp)).toBe(true);
    expect(isAppInScope(personal(alice), firstPartyApp)).toBe(false);
    expect(isAppInScope(team(alice, acme, "owner"), firstPartyApp)).toBe(false);
  });
});

describe("canManageOAuthApps / canEditOAuthApp", () => {
  it("only owners manage: the personal workspace owner and team owners", () => {
    expect(canManageOAuthApps(personal(alice))).toBe(true);
    expect(canManageOAuthApps(team(alice, acme, "owner"))).toBe(true);
    expect(canManageOAuthApps(team(bob, acme, "admin"))).toBe(false);
    expect(canManageOAuthApps(team(bob, acme, "member"))).toBe(false);
  });

  it.each([
    ["owner of the personal app", personal(alice), alicePersonalApp, true],
    ["someone else", personal(bob), alicePersonalApp, false],
    ["team owner", team(bob, acme, "owner"), acmeApp, true],
    ["team admin", team(bob, acme, "admin"), acmeApp, false],
    ["team member", team(bob, acme, "member"), acmeApp, false],
    ["owner of another team", team(bob, other, "owner"), acmeApp, false],
    ["anyone, for a first-party app", personal(alice), firstPartyApp, false],
  ])("%s → %s", (_label, scope, app, expected) => {
    expect(canEditOAuthApp(scope, app)).toBe(expected);
  });
});

describe("isTrustedApp", () => {
  it("is verified or first-party", () => {
    expect(isTrustedApp({ ...firstPartyApp, verified: false })).toBe(true);
    expect(isTrustedApp({ ...acmeApp, verified: true })).toBe(true);
    expect(isTrustedApp({ ...acmeApp, verified: false })).toBe(false);
  });
});

describe("authorization request", () => {
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const query = (values: Record<string, string>) =>
    readAuthorizeParams((key) => values[key] ?? null);
  const base = {
    response_type: "code",
    client_id: "qrdx_app_123",
    redirect_uri: "https://acme.com/cb",
    scope: "codes:read profile:read",
    state: "xyz",
  };
  const app = {
    redirectUris: ["https://acme.com/cb"],
    scopes: ["profile:read", "codes:read"],
    pkceRequired: false,
  };

  it("needs the required params and response_type=code", () => {
    expect(checkAuthorizeParams(query({ ...base, client_id: "" }))?.error).toBe(
      "invalid_request",
    );
    expect(
      checkAuthorizeParams(query({ ...base, response_type: "token" }))?.error,
    ).toBe("unsupported_response_type");
    expect(checkAuthorizeParams(query(base))).toBeNull();
  });

  it("rejects malformed PKCE parameters", () => {
    expect(
      checkAuthorizeParams(
        query({
          ...base,
          code_challenge: challenge,
          code_challenge_method: "S512",
        }),
      )?.error,
    ).toBe("invalid_request");
    expect(
      checkAuthorizeParams(query({ ...base, code_challenge: "short" }))
        ?.description,
    ).toBe("Malformed code_challenge");
  });

  it("returns the granted scopes in canonical order", () => {
    expect(checkAuthorizeApp(app, query(base))).toEqual({
      ok: true,
      scopes: ["profile:read", "codes:read"],
    });
  });

  it("refuses unregistered redirect URIs and scopes beyond the app's", () => {
    expect(
      checkAuthorizeApp(
        app,
        query({ ...base, redirect_uri: "https://acme.com/cb/" }),
      ),
    ).toMatchObject({ ok: false, error: "invalid_request" });
    expect(
      checkAuthorizeApp(app, query({ ...base, scope: "codes:write" })),
    ).toMatchObject({ ok: false, error: "invalid_scope" });
  });

  it("enforces PKCE with S256 when the app requires it", () => {
    const strict = { ...app, pkceRequired: true };
    expect(checkAuthorizeApp(strict, query(base))).toMatchObject({
      ok: false,
      error: "invalid_request",
    });
    expect(
      checkAuthorizeApp(
        strict,
        query({
          ...base,
          code_challenge: challenge,
          code_challenge_method: "plain",
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      checkAuthorizeApp(strict, query({ ...base, code_challenge: challenge })),
    ).toMatchObject({ ok: true });
  });

  it("round-trips only the params that were sent", () => {
    expect(authorizeParamEntries(query(base))).toEqual([
      ["response_type", "code"],
      ["client_id", "qrdx_app_123"],
      ["redirect_uri", "https://acme.com/cb"],
      ["scope", "codes:read profile:read"],
      ["state", "xyz"],
    ]);
    expect(
      authorizeParamEntries(query({ ...base, code_challenge: challenge })),
    ).toContainEqual(["code_challenge_method", "S256"]);
  });

  it("keeps the redirect URI's own query and appends state", () => {
    expect(
      redirectWith(
        { redirectUri: "https://acme.com/cb?tenant=eu", state: "a b" },
        { error: "access_denied" },
      ),
    ).toBe("https://acme.com/cb?tenant=eu&error=access_denied&state=a+b");
  });
});
