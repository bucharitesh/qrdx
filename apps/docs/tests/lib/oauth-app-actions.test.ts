// Which OAuth app server actions revalidate /settings/developers. Creating an
// app must not: the re-render redirects /settings/developers/new to the list
// once the plan's app limit is reached, which unmounted the dialog showing the
// new client secret (its only showing). The service, scope and rate limits are
// fakes; nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: vi.fn() }));
vi.mock("@/lib/scope", () => ({
  getActiveScope: async () => ({ userId: "user_1", organizationId: null }),
}));
vi.mock("@/lib/oauth-apps/service", () => {
  const app = { id: "app_1", clientId: "qrdx_app_1", name: "E2E app" };
  return {
    createOAuthApp: async () => ({ app, clientSecret: "qrdx_cs_secret" }),
    updateOAuthApp: async () => app,
    setOAuthAppActive: async () => ({ id: app.id, active: false }),
    regenerateOAuthAppSecret: async () => ({
      clientSecret: "qrdx_cs_new",
      secretRotatedAt: new Date(),
    }),
    deleteOAuthApp: async () => ({ id: app.id }),
  };
});

const { createOAuthAppAction, deleteOAuthAppAction, updateOAuthAppAction } =
  await import("@/app/settings/developers/_lib/actions");

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
  beforeEach(() => mocks.revalidatePath.mockClear());

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
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/settings/developers",
      "layout",
    );
  });
});
