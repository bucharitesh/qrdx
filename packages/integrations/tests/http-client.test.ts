import { describe, expect, it } from "vitest";
import {
  errorCodeForStatus,
  IntegrationApiError,
  providerRequest,
  readErrorMessage,
} from "../src/core/http-client";
import { json, mockFetch, networkError } from "./helpers";

const PROVIDER = { slug: "acme", name: "Acme" };

describe("providerRequest", () => {
  it("parses JSON and passes the request through", async () => {
    const { calls } = mockFetch(json({ ok: true }));
    const result = await providerRequest<{ ok: boolean }>(
      PROVIDER,
      "https://api.acme.test/x",
      { method: "POST", headers: { Authorization: "Bearer secret" } }
    );
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.authorization).toBe("Bearer secret");
  });

  it("returns undefined for 204", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(
      providerRequest(PROVIDER, "https://api.acme.test/x")
    ).resolves.toBeUndefined();
  });

  it.each([
    [401, "unauthorized"],
    [402, "upgrade_required"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [429, "rate_limited"],
    [400, "bad_request"],
    [503, "server"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ message: "nope" }, status));
    const error = await providerRequest(
      PROVIDER,
      "https://api.acme.test/x"
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrationApiError);
    expect((error as IntegrationApiError).code).toBe(code);
    expect((error as IntegrationApiError).status).toBe(status);
    expect(errorCodeForStatus(status)).toBe(code);
  });

  it("uses our own wording for auth errors and the provider's for 400/403", async () => {
    mockFetch(json({ message: "Invalid token abc" }, 401));
    const auth = (await providerRequest(PROVIDER, "https://a.test").catch(
      (e: unknown) => e
    )) as IntegrationApiError;
    expect(auth.message).toBe(
      "Acme rejected the saved credentials. Reconnect the account."
    );

    mockFetch(json({ error: { message: "Slug taken" } }, 400));
    const bad = (await providerRequest(PROVIDER, "https://a.test").catch(
      (e: unknown) => e
    )) as IntegrationApiError;
    expect(bad.message).toBe("Acme: Slug taken");
  });

  it("reads Retry-After on 429", async () => {
    mockFetch(json({}, 429, { "retry-after": "30" }));
    const error = (await providerRequest(PROVIDER, "https://a.test").catch(
      (e: unknown) => e
    )) as IntegrationApiError;
    expect(error.retryAfterSeconds).toBe(30);
  });

  it("maps network failures without leaking the request", async () => {
    mockFetch(networkError());
    const error = (await providerRequest(PROVIDER, "https://a.test", {
      headers: { Authorization: "Bearer top-secret" },
    }).catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.code).toBe("network");
    expect(error.status).toBe(0);
    expect(error.message).not.toContain("top-secret");
  });
});

describe("readErrorMessage", () => {
  it("handles common shapes", () => {
    expect(readErrorMessage({ message: "a" })).toBe("a");
    expect(readErrorMessage({ error: { message: "b" } })).toBe("b");
    expect(readErrorMessage({ error_summary: "c/..." })).toBe("c/...");
    expect(readErrorMessage({ error: "d" })).toBe("d");
    expect(readErrorMessage("plain")).toBe("plain");
    expect(readErrorMessage(null)).toBeUndefined();
  });
});
