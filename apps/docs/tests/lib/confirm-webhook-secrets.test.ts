// Showing or rotating a webhook's signing secret asks "Confirm it's you"
// (app/(app)/dashboard/webhooks/_lib/actions.ts): whoever has the secret can sign
// requests the customer's server trusts as QRdx's. The confirmation is the
// real one (lib/account/confirmation-server.tsx) on in-memory tables
// (tests/support/fake-db.ts); the endpoint store records what it was asked.
// Adding an endpoint, or pointing one at a new URL, asks too: the
// workspace's events would go to a new address. Someone who can't manage
// webhooks is refused for that, never asked to confirm, and the other
// webhook actions (events, pausing, test pings) don't ask.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  scope: { userId: "user_1", organizationId: "org_t", role: "owner" },
  calls: [] as string[],
  /** The stored endpoint's URL, as getEndpoint returns it */
  currentUrl: "https://hooks.qrdx.test/old",
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", email: "ada@qrdx.test" },
        session: { id: "session_1", createdAt: new Date() },
      }),
    },
  },
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/scope", () => ({ getActiveScope: async () => state.scope }));
vi.mock("@/lib/events/endpoints", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/events/endpoints")>();
  const { assertCan } = await import("@/lib/permissions-server");
  const record =
    (name: string, result: unknown) =>
    async (scope: Parameters<typeof assertCan>[0], id: string) => {
      assertCan(scope, "webhooks.manage");
      state.calls.push(`${name} ${id}`);
      return result;
    };
  return {
    ...actual,
    createEndpoint: async (
      scope: Parameters<typeof assertCan>[0],
      input: { url: string },
    ) => {
      assertCan(scope, "webhooks.manage");
      state.calls.push(`create ${input.url}`);
      return { endpoint: { id: "wh_new" }, secret: "whsec_first" };
    },
    getEndpoint: async () => ({ id: "wh_1", url: state.currentUrl }),
    revealSecret: record("reveal", "whsec_shown"),
    rotateSecret: record("rotate", "whsec_new"),
    updateEndpoint: record("update", { id: "wh_1" }),
    sendTestPing: record("test", { ok: true }),
  };
});

const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);
const webhooks = await import("@/app/(app)/dashboard/webhooks/_lib/actions");

const REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };

beforeEach(() => {
  fakeDb.reset();
  fakeDb.seed("user", [
    { id: "user_1", email: "ada@qrdx.test", twoFactorEnabled: false },
  ]);
  state.scope = { userId: "user_1", organizationId: "org_t", role: "owner" };
  state.calls = [];
  state.currentUrl = "https://hooks.qrdx.test/old";
});

describe("a webhook's address", () => {
  const events = ["scan.created"];

  it("adding an endpoint asks first, then adds it", async () => {
    const input = { url: "https://hooks.qrdx.test/new", events };
    expect(await webhooks.createWebhookEndpoint(input)).toEqual(REQUIRED);
    expect(state.calls).toEqual([]);
    await recordConfirmation({ userId: "user_1", sessionId: "session_1" });
    expect(await webhooks.createWebhookEndpoint(input)).toMatchObject({
      ok: true,
      data: { secret: "whsec_first" },
    });
    expect(state.calls).toEqual(["create https://hooks.qrdx.test/new"]);
  });

  it("a new URL asks first; the same URL, events or pausing don't", async () => {
    expect(
      await webhooks.updateWebhookEndpoint({
        id: "wh_1",
        url: "https://hooks.qrdx.test/elsewhere",
        events,
      }),
    ).toEqual(REQUIRED);
    expect(state.calls).toEqual([]);
    // The form sends the URL it already had, with new events.
    expect(
      await webhooks.updateWebhookEndpoint({
        id: "wh_1",
        url: "https://hooks.qrdx.test/old",
        events,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await webhooks.updateWebhookEndpoint({ id: "wh_1", events }),
    ).toMatchObject({ ok: true });
    expect(
      await webhooks.updateWebhookEndpoint({ id: "wh_1", active: false }),
    ).toMatchObject({ ok: true });
    expect(state.calls).toEqual(["update wh_1", "update wh_1", "update wh_1"]);

    await recordConfirmation({ userId: "user_1", sessionId: "session_1" });
    expect(
      await webhooks.updateWebhookEndpoint({
        id: "wh_1",
        url: "https://hooks.qrdx.test/elsewhere",
        events,
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses someone who can't manage webhooks for that, without asking", async () => {
    state.scope = { ...state.scope, role: "member" };
    const created = await webhooks.createWebhookEndpoint({
      url: "https://hooks.qrdx.test/new",
      events,
    });
    expect(created.ok).toBe(false);
    expect(created).not.toEqual(REQUIRED);
    expect(state.calls).toEqual([]);
  });
});

describe("a webhook's signing secret", () => {
  it("isn't shown or rotated until this session confirms it's them", async () => {
    expect(await webhooks.revealWebhookSecret({ id: "wh_1" })).toEqual(
      REQUIRED,
    );
    expect(await webhooks.rotateWebhookSecret({ id: "wh_1" })).toEqual(
      REQUIRED,
    );
    expect(state.calls).toEqual([]);

    await recordConfirmation({ userId: "user_1", sessionId: "session_1" });
    expect(await webhooks.revealWebhookSecret({ id: "wh_1" })).toEqual({
      ok: true,
      data: { secret: "whsec_shown" },
    });
    expect(await webhooks.rotateWebhookSecret({ id: "wh_1" })).toEqual({
      ok: true,
      data: { secret: "whsec_new" },
    });
    expect(state.calls).toEqual(["reveal wh_1", "rotate wh_1"]);
  });

  it("refuses someone who can't manage webhooks for that, without asking", async () => {
    state.scope = { ...state.scope, role: "member" };
    for (const result of [
      await webhooks.revealWebhookSecret({ id: "wh_1" }),
      await webhooks.rotateWebhookSecret({ id: "wh_1" }),
    ]) {
      expect(result.ok).toBe(false);
      expect(result).not.toEqual(REQUIRED);
    }
    expect(state.calls).toEqual([]);
  });

  it("leaves the other webhook actions alone", async () => {
    expect(
      await webhooks.updateWebhookEndpoint({ id: "wh_1", active: false }),
    ).toMatchObject({ ok: true });
    expect(await webhooks.sendWebhookTest({ id: "wh_1" })).toMatchObject({
      ok: true,
    });
    expect(state.calls).toEqual(["update wh_1", "test wh_1"]);
  });
});
