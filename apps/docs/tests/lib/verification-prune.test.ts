// Expired Better Auth verification values are deleted by the webhooks cron
// (lib/auth/verification-prune.ts); only rows a full day past expiry go.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {},
  verification: {},
  knownDevice: {},
}));

const {
  KNOWN_DEVICE_MAX_AGE_MS,
  VERIFICATION_GRACE_MS,
  knownDevicePruneCutoff,
  verificationPruneCutoff,
} = await import("@/lib/auth/verification-prune");

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

describe("knownDevicePruneCutoff", () => {
  it("forgets a browser 400 days after it was last seen", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(knownDevicePruneCutoff(now).toISOString()).toBe(
      "2025-10-01T12:00:00.000Z",
    );
    expect(KNOWN_DEVICE_MAX_AGE_MS).toBe(400 * 24 * 60 * 60 * 1000);
  });

  it("matches the device cookie's lifetime, so a kept row can still match", async () => {
    const { KNOWN_DEVICE_DAYS } = await import("@repo/auth/new-sign-in");
    expect(KNOWN_DEVICE_MAX_AGE_MS).toBe(
      KNOWN_DEVICE_DAYS * 24 * 60 * 60 * 1000,
    );
  });
});
