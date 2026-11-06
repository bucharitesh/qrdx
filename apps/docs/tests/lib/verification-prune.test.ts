// Expired Better Auth verification values are deleted by the webhooks cron
// (lib/auth/verification-prune.ts); only rows a full day past expiry go.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({ database: {}, verification: {} }));

const { VERIFICATION_GRACE_MS, verificationPruneCutoff } = await import(
  "@/lib/auth/verification-prune"
);

describe("verificationPruneCutoff", () => {
  it("keeps a day of grace after expiry", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(verificationPruneCutoff(now).toISOString()).toBe(
      "2026-11-04T12:00:00.000Z",
    );
    expect(VERIFICATION_GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("never reaches a trusted device that is still valid", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const trustedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(trustedUntil > verificationPruneCutoff(now)).toBe(true);
  });
});
