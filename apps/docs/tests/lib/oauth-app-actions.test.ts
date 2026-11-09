// Which OAuth app server actions revalidate the dashboard (API keys & apps
// is a workspace's settings page). Creating an app must not: the re-render
// redirects …/settings/developers/new to the list
// once the plan's app limit is reached, which unmounted the dialog showing the
// new client secret (its only showing). The service, scope and rate limits are
// fakes; nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  role: "owner" as string,
  /** This session confirmed it's them in the last 10 minutes */
  confirmed: true,
  asked: 0,
  minted: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: vi.fn() }));
vi.mock("@/lib/scope", () => ({
  getActiveScope: async () => ({
    userId: "user_1",
    organizationId: null,
    role: mocks.role,
  }),
}));
vi.mock("@/lib/account/confirmation-scope", () => ({
  confirmationNeededFor: async () => {
    mocks.asked += 1;
    return mocks.confirmed
      ? null
      : { ok: false, error: "CONFIRMATION_REQUIRED" };
  },
}));
vi.mock("@/lib/oauth-apps/service", () => {
  const app = { id: "app_1", clientId: "qrdx_app_1", name: "E2E app" };
  return {
    createOAuthApp: async () => {
      mocks.minted.push("create");
      return { app, clientSecret: "qrdx_cs_secret" };
    },
    updateOAuthApp: async () => app,
    setOAuthAppActive: async () => ({ id: app.id, active: false }),
    regenerateOAuthAppSecret: async () => {
      mocks.minted.push("secret");
      return { clientSecret: "qrdx_cs_new", secretRotatedAt: new Date() };
    },
    deleteOAuthApp: async () => ({ id: app.id }),
  };
});

const {
  createOAuthAppAction,
  deleteOAuthAppAction,
  regenerateOAuthAppSecretAction,
  setOAuthAppActiveAction,
  updateOAuthAppAction,
} = await import("@/app/settings/developers/_lib/actions");

const input = {
  name: "E2E app",
  description: "",
  websiteUrl: "https://example.com",
  logoUrl: "",
  redirectUris: ["https://example.com/callback"],
  scopes: ["profile:read"],
  pkceRequired: true,
};

describe("OAuth app actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockClear();
    mocks.role = "owner";
    mocks.confirmed = true;
    mocks.asked = 0;
    mocks.minted = [];
  });

  it("returns the new client secret without revalidating the pages", async () => {
    const result = await createOAuthAppAction(input);
    expect(result).toMatchObject({
      ok: true,
      data: { clientSecret: "qrdx_cs_secret" },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates after other changes", async () => {
    expect(await updateOAuthAppAction({ ...input, id: "app_1" })).toMatchObject(
      { ok: true },
    );
    expect(await deleteOAuthAppAction({ id: "app_1" })).toMatchObject({
      ok: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("asks Confirm it's you before minting a client secret, and mints nothing until then", async () => {
    mocks.confirmed = false;
    const required = { ok: false, error: "CONFIRMATION_REQUIRED" };
    expect(await createOAuthAppAction(input)).toEqual(required);
    expect(await regenerateOAuthAppSecretAction({ id: "app_1" })).toEqual(
      required,
    );
    expect(mocks.minted).toEqual([]);

    mocks.confirmed = true;
    expect(await createOAuthAppAction(input)).toMatchObject({ ok: true });
    expect(await regenerateOAuthAppSecretAction({ id: "app_1" })).toMatchObject(
      { ok: true, data: { clientSecret: "qrdx_cs_new" } },
    );
    expect(mocks.minted).toEqual(["create", "secret"]);
  });

  it("editing, pausing and deleting an app don't ask", async () => {
    mocks.confirmed = false;
    expect(await updateOAuthAppAction({ ...input, id: "app_1" })).toMatchObject(
      { ok: true },
    );
    expect(
      await setOAuthAppActiveAction({ id: "app_1", active: false }),
    ).toMatchObject({ ok: true });
    expect(await deleteOAuthAppAction({ id: "app_1" })).toMatchObject({
      ok: true,
    });
    expect(mocks.asked).toBe(0);
  });

  it("doesn't ask someone who can't manage apps: the service refuses them", async () => {
    mocks.role = "member";
    mocks.confirmed = false;
    // The fake service doesn't check roles; the point is nobody is asked.
    await createOAuthAppAction(input);
    expect(mocks.asked).toBe(0);
  });
});
