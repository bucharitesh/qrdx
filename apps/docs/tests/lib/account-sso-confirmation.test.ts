// Workspace SSO changes need "Confirm it's you" (ee/sso/actions.ts): creating,
// editing, verifying and removing the connection, and requiring single
// sign-on, answer CONFIRMATION_REQUIRED without a recent confirmation and
// never reach ee/sso/connections.ts; the join role doesn't ask. Nothing
// connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  confirmed: false,
  sessionUserId: "user_1" as string | null,
  calls: [] as string[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/scope", () => ({
  getActiveScope: async () => ({ userId: "user_1", organizationId: "org_1" }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: async () =>
    state.sessionUserId
      ? {
          userId: state.sessionUserId,
          sessionId: "session_1",
          sessionCreatedAt: new Date(),
        }
      : null,
  requireRecentConfirmation: async () =>
    state.confirmed ? null : { ok: false, error: "CONFIRMATION_REQUIRED" },
}));
vi.mock("@/ee/sso/connections", () => {
  const record = (name: string) => async () => {
    state.calls.push(name);
    return { domain: "acme.test" };
  };
  return {
    createSsoConnection: record("create"),
    updateSsoConnection: record("update"),
    verifySsoDomain: record("verify"),
    deleteSsoConnection: record("delete"),
    setSsoJoinRole: async (
      _scope: unknown,
      _headers: unknown,
      role: string,
    ) => {
      state.calls.push("role");
      return role;
    },
    setSsoRequired: async (
      _scope: unknown,
      _headers: unknown,
      viewer: { sessionId: string },
      on: boolean,
    ) => {
      state.calls.push(`required:${on}:${viewer.sessionId}`);
      return { on, signedOut: 0 };
    },
  };
});

const actions = await import("@/ee/sso/actions");

beforeEach(() => {
  state.confirmed = false;
  state.sessionUserId = "user_1";
  state.calls = [];
});

const required = {
  success: false,
  error: expect.objectContaining({ code: "CONFIRMATION_REQUIRED" }),
};

describe("SSO connection changes", () => {
  it("ask first, and change nothing until confirmed", async () => {
    expect(
      await actions.createSso({
        providerId: "p",
        protocol: "oidc",
        domain: "acme.test",
        issuer: "https://idp.test",
        clientId: "id",
        clientSecret: "secret",
      }),
    ).toEqual(required);
    expect(
      await actions.updateSso({ protocol: "oidc", clientSecret: "s" }),
    ).toEqual(required);
    expect(await actions.verifySso()).toEqual(required);
    expect(await actions.removeSso()).toEqual(required);
    expect(state.calls).toEqual([]);
  });

  it("go ahead once confirmed", async () => {
    state.confirmed = true;
    expect(await actions.verifySso()).toMatchObject({ success: true });
    expect(await actions.removeSso()).toMatchObject({ success: true });
    expect(state.calls).toEqual(["verify", "delete"]);
  });

  it("refuse a session that isn't the scope's person", async () => {
    state.confirmed = true;
    state.sessionUserId = "user_2";
    expect(await actions.removeSso()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(state.calls).toEqual([]);
  });

  it("requiring single sign-on asks, both ways, and passes the session on", async () => {
    expect(await actions.setSsoRequirement(true)).toEqual(required);
    expect(await actions.setSsoRequirement(false)).toEqual(required);
    expect(state.calls).toEqual([]);
    state.confirmed = true;
    expect(await actions.setSsoRequirement(true)).toMatchObject({
      success: true,
      data: { on: true },
    });
    expect(await actions.setSsoRequirement(false)).toMatchObject({
      success: true,
    });
    expect(state.calls).toEqual([
      "required:true:session_1",
      "required:false:session_1",
    ]);
  });

  it("the join role doesn't ask", async () => {
    expect(await actions.setSsoRole("member")).toMatchObject({
      success: true,
    });
    expect(state.calls).toEqual(["role"]);
  });
});
