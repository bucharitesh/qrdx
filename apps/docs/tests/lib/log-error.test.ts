import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "@/lib/log-error";

afterEach(() => vi.restoreAllMocks());

describe("logError", () => {
  it("never logs the raw error object or its response details", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("Unauthorized"), {
      name: "SDKError",
      statusCode: 401,
      rawResponse: {
        status: 401,
        url: "https://api.polar.sh/v1/customers/external/user_123",
        headers: { "www-authenticate": "Bearer realm=polar" },
      },
      body: '{"email":"ada@example.com"}',
    });
    logError(error, { action: "createCheckout" });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("SDKError");
    expect(logged).toContain("401");
    expect(logged).not.toContain("user_123");
    expect(logged).not.toContain("ada@example.com");
    expect(logged).not.toContain("www-authenticate");
    expect(logged).not.toContain("stack");
  });

  it("keeps the stack for code bugs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(new TypeError("x is undefined"), { action: "save" });
    expect(JSON.stringify(spy.mock.calls)).toContain("stack");
  });

  it("logs expected errors as warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Sign in");
    error.name = "UnauthorizedError";
    logError(error);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(err).not.toHaveBeenCalled();
  });

  it("trims very long messages", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(new Error("a".repeat(5000)));
    const [, payload] = spy.mock.calls[0] as [string, { message: string }];
    expect(payload.message.length).toBeLessThanOrEqual(300);
  });
});
