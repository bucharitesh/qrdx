// The stolen-session check keeps where a session started for as long as a
// session can live (packages/auth/session-origin-rules.ts), and the 30-day
// cap decides how long that is (packages/auth/session-lifetime.ts). The
// rules file stays free of the plugin's imports, so the two numbers live
// apart: this keeps them the same.
import { SESSION_MAX_DAYS } from "@repo/auth/session-lifetime";
import { SESSION_ORIGIN_DAYS } from "@repo/auth/session-origin-rules";
import { describe, expect, it } from "vitest";

describe("how long a session lasts", () => {
  it("is the same for the cap and for where it started", () => {
    expect(SESSION_ORIGIN_DAYS).toBe(SESSION_MAX_DAYS);
  });
});
