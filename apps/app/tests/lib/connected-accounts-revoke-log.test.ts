// A failed token revoke is logged with the provider name. console.error reads
// its first argument as a format string, so the provider goes in as its own
// argument: a "%s" or "%o" in it is printed as written, not substituted.
import { format } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@repo/database", () => ({ database: {}, integration: {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({}),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/integrations", () => ({
  initializeIntegrations: () => {},
  getIntegration: async () => {
    throw new Error("provider away");
  },
  getIntegrationConfigWithEnv: () => ({}),
  getIntegrationRegistry: () => new Map(),
  createFilePickerClient: () => ({}),
  createShortLinkClient: () => ({}),
  isFilePickerProvider: () => false,
  isShortLinkProvider: () => false,
  isIntegrationApiError: () => false,
  revokeProviderToken: async () => false,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({
  NextResponse: { json: () => new Response() },
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));

const { revokeStoredToken } = await import("@/lib/connected-accounts/server");

afterEach(() => {
  vi.restoreAllMocks();
});

async function loggedLine(provider: string): Promise<string> {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await revokeStoredToken("user-1", provider)).toBe(false);
  expect(error).toHaveBeenCalledTimes(1);
  // What Node prints: util.format applied to the arguments.
  return format(...(error.mock.calls[0] as unknown[]));
}

describe("revokeStoredToken failure log", () => {
  it("logs the same line as before for a real provider", async () => {
    expect(await loggedLine("dropbox")).toBe(
      "[integrations] dropbox token revoke failed: provider away",
    );
  });

  it("prints format directives in the provider as written", async () => {
    expect(await loggedLine("%s%o")).toBe(
      "[integrations] %s%o token revoke failed: provider away",
    );
  });
});
