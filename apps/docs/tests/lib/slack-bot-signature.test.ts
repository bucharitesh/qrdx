// Slack request signatures (lib/slack-bot/signature.ts): v0 HMAC-SHA256 over
// "v0:<timestamp>:<raw body>", compared in constant time, with timestamps
// more than five minutes off refused. The secret is a fake.
import { describe, expect, it } from "vitest";
import {
  SLACK_MAX_SKEW_SECONDS,
  signSlackRequest,
  verifySlackSignature,
} from "@/lib/slack-bot/signature";

const SECRET = "fake-signing-secret";
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const TS = String(NOW / 1000);
const BODY = "token=x&team_id=T0001&text=hello";

const check = (
  overrides: Partial<Parameters<typeof verifySlackSignature>[0]>,
) =>
  verifySlackSignature({
    secret: SECRET,
    rawBody: BODY,
    timestamp: TS,
    signature: signSlackRequest(SECRET, BODY, TS),
    now: NOW,
    ...overrides,
  });

describe("verifySlackSignature", () => {
  it("accepts Slack's signature over the raw body", () => {
    expect(check({})).toEqual({ ok: true });
    // The documented example from Slack's guide.
    expect(
      signSlackRequest("8f742231b10e8888abcd99yyyzzz85a5", "a", "1"),
    ).toMatch(/^v0=[0-9a-f]{64}$/);
  });

  it("refuses a wrong secret, a changed body or a changed timestamp", () => {
    expect(check({ secret: "another-secret" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ rawBody: `${BODY}&extra=1` })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      check({
        timestamp: String(Number(TS) - 1),
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(check({ signature: "v0=abc" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ signature: `v1=${"0".repeat(64)}` })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ timestamp: "12ab" })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses timestamps more than five minutes from now, either way", () => {
    const old = String(NOW / 1000 - SLACK_MAX_SKEW_SECONDS - 1);
    expect(
      check({ timestamp: old, signature: signSlackRequest(SECRET, BODY, old) }),
    ).toEqual({ ok: false, reason: "stale" });
    const future = String(NOW / 1000 + SLACK_MAX_SKEW_SECONDS + 1);
    expect(
      check({
        timestamp: future,
        signature: signSlackRequest(SECRET, BODY, future),
      }),
    ).toEqual({ ok: false, reason: "stale" });
    const edge = String(NOW / 1000 - SLACK_MAX_SKEW_SECONDS);
    expect(
      check({
        timestamp: edge,
        signature: signSlackRequest(SECRET, BODY, edge),
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a request without a signature, timestamp or secret", () => {
    expect(check({ signature: null })).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(check({ timestamp: null })).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(check({ secret: "" })).toEqual({ ok: false, reason: "missing" });
  });
});
