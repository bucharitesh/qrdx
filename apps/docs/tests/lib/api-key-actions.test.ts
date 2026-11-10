// Settings → Developers, API keys: the server actions (validation, the
// messages people see, which ones refresh the page, "Confirm it's you" before
// a key is made) and the origin the ready-to-paste curl is built from. The
// service, scope, confirmation and rate limits are fakes; nothing connects to
// a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  signedIn: true,
  role: "member" as string,
  /** This session confirmed it's them in the last 10 minutes */
  confirmed: true,
  asked: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({ logError: vi.fn() }));
vi.mock("@/lib/scope", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getActiveScope: async () => {
      if (!mocks.signedIn) throw new UnauthorizedError();
      return {
        userId: "u_alice",
        organizationId: "org_acme",
        role: mocks.role,
      };
    },
  };
});
vi.mock("@/lib/account/confirmation-scope", () => ({
  confirmationNeededFor: async () => {
    mocks.asked += 1;
    return mocks.confirmed
      ? null
      : { ok: false, error: "CONFIRMATION_REQUIRED" };
  },
}));
vi.mock("@/lib/api-keys/service", async () => {
  class ApiKeysUnavailableError extends Error {
    constructor() {
      super("API keys aren't available on this deployment yet.");
    }
  }
  return {
    ApiKeysUnavailableError,
    createApiKey: mocks.createApiKey,
    revokeApiKey: mocks.revokeApiKey,
  };
});

const { createApiKeyAction, revokeApiKeyAction } = await import(
  "@/app/(app)/settings/developers/_lib/api-key-actions"
);
const { ApiKeysUnavailableError } = await import("@/lib/api-keys/service");
const { HttpError } = await import("@/lib/error-response");
const { requestOrigin } = await import("@/app/(app)/settings/developers/_lib/origin");

const input = { name: "CI", scopes: ["codes:write"], expiresInDays: null };

beforeEach(() => {
  mocks.revalidatePath.mockClear();
  mocks.createApiKey.mockReset();
  mocks.revokeApiKey.mockReset();
  mocks.signedIn = true;
  mocks.role = "member";
  mocks.confirmed = true;
  mocks.asked = 0;
});

describe("createApiKeyAction", () => {
  it("creates the key in the open workspace and returns it without refreshing", async () => {
    mocks.createApiKey.mockResolvedValue({
      key: "qrdx_x",
      apiKey: { id: "k1" },
    });
    expect(await createApiKeyAction(input)).toEqual({
      ok: true,
      data: { key: "qrdx_x", apiKey: { id: "k1" } },
    });
    expect(mocks.createApiKey).toHaveBeenCalledWith(
      { userId: "u_alice", organizationId: "org_acme", role: "member" },
      { name: "CI", scopes: ["codes:write"], expiresInDays: null },
    );
    // A refresh now could unmount the dialog showing the key.
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects bad input before touching the service", async () => {
    expect(
      await createApiKeyAction({ ...input, scopes: ["admin"] }),
    ).toMatchObject({
      ok: false,
    });
    expect(await createApiKeyAction({ ...input, name: "" })).toEqual({
      ok: false,
      error: "Give the key a name.",
    });
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("says why it failed in words people can act on", async () => {
    mocks.createApiKey.mockRejectedValueOnce(
      new HttpError(
        403,
        "LIMIT_REACHED",
        "You have 25 active API keys in this workspace. Revoke one to create another.",
      ),
    );
    expect(await createApiKeyAction(input)).toEqual({
      ok: false,
      error:
        "You have 25 active API keys in this workspace. Revoke one to create another.",
    });

    mocks.createApiKey.mockRejectedValueOnce(new ApiKeysUnavailableError());
    expect(await createApiKeyAction(input)).toEqual({
      ok: false,
      error: "API keys aren't available on this deployment yet.",
    });

    mocks.createApiKey.mockRejectedValueOnce(
      new Error("db down: secret detail"),
    );
    expect(await createApiKeyAction(input)).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });

    mocks.signedIn = false;
    expect(await createApiKeyAction(input)).toEqual({
      ok: false,
      error: "Sign in to manage API keys.",
    });
  });
});

describe("createApiKeyAction and Confirm it's you", () => {
  it("asks first and makes no key until this session has confirmed", async () => {
    mocks.confirmed = false;
    expect(await createApiKeyAction(input)).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(mocks.createApiKey).not.toHaveBeenCalled();

    mocks.confirmed = true;
    mocks.createApiKey.mockResolvedValue({
      key: "qrdx_y",
      apiKey: { id: "k2" },
    });
    expect(await createApiKeyAction(input)).toMatchObject({ ok: true });
    expect(mocks.createApiKey).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask someone whose role can't make keys: they get the refusal", async () => {
    mocks.role = "viewer";
    mocks.confirmed = false;
    mocks.createApiKey.mockRejectedValueOnce(
      new HttpError(403, "FORBIDDEN", "You're a viewer here."),
    );
    expect(await createApiKeyAction(input)).toEqual({
      ok: false,
      error: "You're a viewer here.",
    });
    expect(mocks.asked).toBe(0);
  });

  it("revoking a key never asks", async () => {
    mocks.confirmed = false;
    mocks.revokeApiKey.mockResolvedValue({ id: "k1" });
    expect(await revokeApiKeyAction({ id: "k1" })).toMatchObject({ ok: true });
    expect(mocks.asked).toBe(0);
  });
});

describe("revokeApiKeyAction", () => {
  it("revokes and refreshes the page", async () => {
    mocks.revokeApiKey.mockResolvedValue({ id: "k1" });
    expect(await revokeApiKeyAction({ id: "k1" })).toEqual({
      ok: true,
      data: { id: "k1" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("doesn't refresh when nothing changed", async () => {
    mocks.revokeApiKey.mockRejectedValue(
      new HttpError(404, "NOT_FOUND", "API key not found."),
    );
    expect(await revokeApiKeyAction({ id: "k1" })).toEqual({
      ok: false,
      error: "API key not found.",
    });
    expect(await revokeApiKeyAction({ id: "" })).toMatchObject({ ok: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("requestOrigin", () => {
  const fallback = new URL("https://qrdx.dev");
  const origin = (values: Record<string, string>) =>
    requestOrigin(new Headers(values), fallback);

  it("uses the host the request came in on", () => {
    expect(origin({ host: "localhost:3001" })).toBe("http://localhost:3001");
    expect(origin({ host: "qrdx.dev", "x-forwarded-proto": "https" })).toBe(
      "https://qrdx.dev",
    );
    expect(
      origin({ "x-forwarded-host": "qr.example.com", host: "internal:8080" }),
    ).toBe("https://qr.example.com");
  });

  it("falls back on anything that isn't a plain host", () => {
    expect(origin({})).toBe("https://qrdx.dev");
    expect(origin({ host: "evil.com/path" })).toBe("https://qrdx.dev");
    expect(origin({ host: "user@evil.com" })).toBe("https://qrdx.dev");
    expect(
      origin({ host: "qrdx.dev", "x-forwarded-proto": "javascript" }),
    ).toBe("https://qrdx.dev");
  });
});
