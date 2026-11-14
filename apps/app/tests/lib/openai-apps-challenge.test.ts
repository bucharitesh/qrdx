// /.well-known/openai-apps-challenge answers OpenAI's domain check for the
// plugin directory with the bare token, and is a 404 on deployments that
// haven't set one.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {} as { OPENAI_APPS_CHALLENGE?: string },
}));

vi.mock("@/env", () => ({ env: state.env }));

const { GET } = await import("@/app/.well-known/openai-apps-challenge/route");

describe("/.well-known/openai-apps-challenge", () => {
  beforeEach(() => {
    state.env.OPENAI_APPS_CHALLENGE = undefined;
  });

  it("is a 404 without a token", async () => {
    const response = GET();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("challenge");
  });

  it("returns only the token, as uncached plain text", async () => {
    state.env.OPENAI_APPS_CHALLENGE = "test-token-123";
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("test-token-123");
  });
});
