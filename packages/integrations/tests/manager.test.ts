import { format } from "node:util";
import { describe, expect, it, vi } from "vitest";

// One stored integration whose token is due for a refresh that fails.
const row = vi.hoisted(() => ({
  id: "int_1",
  userId: "user_1",
  provider: "%s%o",
  accessToken: "access",
  refreshToken: null,
  status: "active",
  metadata: null,
  expiresAt: new Date(0),
}));

vi.mock("@repo/database", () => ({
  integration: {},
  database: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([row]) }),
      }),
    }),
  },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));
vi.mock("../src/core/encryption", () => ({
  decryptApiKey: (value: string) => value,
}));
vi.mock("../src/core/token-refresh", () => ({
  shouldRefreshToken: () => true,
  refreshIntegrationToken: () => Promise.reject(new Error("refresh failed")),
}));

const { getIntegration } = await import("../src/core/manager");

describe("getIntegration", () => {
  it("logs a failed refresh with the provider as text, never as a format string", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await getIntegration("user_1", row.provider, () => ({}));
    expect(result?.status).toBe("error");
    expect(log).toHaveBeenCalledTimes(1);
    const line = format(...(log.mock.calls[0] as unknown[]));
    expect(line).toMatch(
      /^Failed to auto-refresh token for %s%o: Error: refresh failed/
    );
  });
});
