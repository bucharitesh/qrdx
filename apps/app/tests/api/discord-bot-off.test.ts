// Without DISCORD_APPLICATION_ID and DISCORD_PUBLIC_KEY (vitest.config.ts
// drops any DISCORD_* from the real environment) the bot doesn't exist here:
// its endpoint and install link answer 404 before reading the body or
// rate limiting anything.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Only one of the two is not enough.
  process.env.DISCORD_APPLICATION_ID = "112233445566778899";
  delete process.env.DISCORD_PUBLIC_KEY;
});

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => {
      throw new Error("Nothing is rate limited while the bot is off");
    },
  }),
}));

const { POST } = await import(
  "@/app/api/integrations/discord/interactions/route"
);
const { GET } = await import("@/app/api/integrations/discord/install/route");

describe("the Discord bot without its settings", () => {
  it("answers 404 to interactions", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrations/discord/interactions", {
        method: "POST",
        headers: {
          "x-signature-ed25519": "0".repeat(128),
          "x-signature-timestamp": String(Math.floor(Date.now() / 1000)),
        },
        body: JSON.stringify({ type: 1 }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("answers 404 instead of an install link", () => {
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });
});
