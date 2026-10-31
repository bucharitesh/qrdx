// Lifecycle rules, unlock cookies and the password gate (no network, no
// database: the code rows are built here). lib/env validates on import:
//   cd apps/docs && DATABASE_URL=postgres://test@127.0.0.1:1/test \
//     npx tsx --conditions=react-server --test lib/redirect/lifecycle.test.ts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { hash } from "bcryptjs";
import type { RedirectCode } from "./code";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-unlock-cookies";

let lifecycle: typeof import("./lifecycle");
before(async () => {
  lifecycle = await import("./lifecycle");
});

const NOW = new Date("2026-06-01T12:00:00Z");
const HOUR = 60 * 60_000;

function makeCode(overrides: Partial<RedirectCode> = {}): RedirectCode {
  return {
    id: "code_1",
    slug: "aB3dE5f",
    kind: "redirect",
    destinationUrl: "https://example.com/",
    domainId: null,
    isActive: true,
    archivedAt: null,
    deletedAt: null,
    scanCount: 0,
    passwordHash: null,
    startsAt: null,
    expiresAt: null,
    scanLimit: null,
    pausedAt: null,
    fallbackUrl: null,
    routing: null,
    utm: null,
    pixels: null,
    ...overrides,
  };
}

describe("lifecycleState", () => {
  const state = (code: RedirectCode, options = {}) =>
    lifecycle.lifecycleState(code, { now: NOW, ...options });

  it("allows a code without rules", () => {
    assert.deepEqual(state(makeCode()), { action: "allow" });
  });

  it("ends paused codes, with the fallback URL", () => {
    const code = makeCode({
      pausedAt: new Date(NOW.getTime() - HOUR),
      fallbackUrl: "https://brand.example/next",
    });
    assert.deepEqual(state(code), {
      action: "ended",
      reason: "paused",
      fallbackUrl: "https://brand.example/next",
    });
  });

  it("shows 'not started' (never the fallback) before the start", () => {
    const code = makeCode({
      startsAt: new Date(NOW.getTime() + HOUR),
      fallbackUrl: "https://brand.example/",
    });
    assert.deepEqual(state(code), {
      action: "ended",
      reason: "not-started",
      fallbackUrl: null,
    });
    assert.deepEqual(state(makeCode({ startsAt: NOW })), { action: "allow" });
  });

  it("ends at the expiry instant", () => {
    assert.equal(state(makeCode({ expiresAt: NOW })).action, "ended");
    assert.deepEqual(
      state(makeCode({ expiresAt: new Date(NOW.getTime() + 1) })),
      { action: "allow" },
    );
  });

  it("ends once the scan limit is reached; page views get one scan of slack", () => {
    const code = makeCode({ scanLimit: 100, scanCount: 99 });
    assert.deepEqual(state(code), { action: "allow" });
    const reached = makeCode({ scanLimit: 100, scanCount: 100 });
    assert.equal(state(reached).action, "ended");
    assert.deepEqual(state(reached, { scanSlack: 1 }), { action: "allow" });
    assert.equal(
      state(makeCode({ scanLimit: 100, scanCount: 101 }), { scanSlack: 1 })
        .action,
      "ended",
    );
  });

  it("gates password codes until unlocked", () => {
    const code = makeCode({ passwordHash: "$2b$10$abc" });
    assert.deepEqual(state(code), { action: "gate", reason: "password" });
    assert.deepEqual(state(code, { unlocked: true }), { action: "allow" });
  });

  it("checks ended rules before the password", () => {
    const code = makeCode({
      passwordHash: "$2b$10$abc",
      expiresAt: new Date(NOW.getTime() - 1),
    });
    assert.equal(state(code).action, "ended");
  });

  it("ignores a fallback that isn't an http(s) URL", () => {
    const code = makeCode({
      pausedAt: NOW,
      fallbackUrl: "javascript:alert(1)",
    });
    assert.deepEqual(state(code), {
      action: "ended",
      reason: "paused",
      fallbackUrl: null,
    });
  });
});

describe("unlock tokens", () => {
  const code = makeCode({ passwordHash: "$2b$10$first" });

  it("round-trips", () => {
    const token = lifecycle.createUnlockToken(code, NOW);
    assert.equal(lifecycle.verifyUnlockToken(code, token, NOW), true);
  });

  it("expires", () => {
    const token = lifecycle.createUnlockToken(code, NOW);
    const later = new Date(
      NOW.getTime() + lifecycle.UNLOCK_TTL_SECONDS * 1000 + 1000,
    );
    assert.equal(lifecycle.verifyUnlockToken(code, token, later), false);
  });

  it("is bound to the code and its current password", () => {
    const token = lifecycle.createUnlockToken(code, NOW);
    assert.equal(
      lifecycle.verifyUnlockToken({ ...code, id: "code_2" }, token, NOW),
      false,
    );
    assert.equal(
      lifecycle.verifyUnlockToken({ ...code, slug: "Zz9Yy8x" }, token, NOW),
      false,
    );
    assert.equal(
      lifecycle.verifyUnlockToken(
        { ...code, passwordHash: "$2b$10$second" },
        token,
        NOW,
      ),
      false,
    );
  });

  it("rejects tampering and junk", () => {
    const token = lifecycle.createUnlockToken(code, NOW);
    const [expiry, signature] = token.split(".");
    assert.equal(
      lifecycle.verifyUnlockToken(
        code,
        `${Number(expiry) + 60}.${signature}`,
        NOW,
      ),
      false,
    );
    for (const junk of [
      "",
      "abc",
      `${expiry}.`,
      `${expiry}.${"A".repeat(43)}`,
    ]) {
      assert.equal(lifecycle.verifyUnlockToken(code, junk, NOW), false);
    }
  });
});

describe("short link gate", () => {
  let code: RedirectCode;
  before(async () => {
    code = makeCode({
      kind: "page",
      passwordHash: await hash("open sesame", 4),
    });
  });

  const post = (body: string, url = "https://qrdx.dev/q/aB3dE5f") =>
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-real-ip": "203.0.113.7",
      },
      body,
    });

  it("gates, then allows the browser holding the cookie", async () => {
    const request = new Request("https://qrdx.dev/q/aB3dE5f");
    assert.deepEqual(await lifecycle.evaluateLifecycle(code, request), {
      action: "gate",
      reason: "password",
    });

    const cookie = `${lifecycle.unlockCookieName(code.slug)}=${lifecycle.createUnlockToken(code)}`;
    const unlocked = new Request("https://qrdx.dev/q/aB3dE5f", {
      headers: { cookie: `other=1; ${cookie}` },
    });
    assert.deepEqual(await lifecycle.evaluateLifecycle(code, unlocked), {
      action: "allow",
    });
  });

  it("shows the password form", async () => {
    const response = await lifecycle.gateResponse(
      code,
      new Request("https://qrdx.dev/q/aB3dE5f"),
      "password",
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.match(html, /<form method="post">/);
    assert.match(html, /type="password"/);
    assert.match(html, /report-abuse\?slug=aB3dE5f/);
    assert.doesNotMatch(html, /<script/i);
  });

  it("rejects a wrong password", async () => {
    const response = await lifecycle.gateResponse(
      code,
      post("password=nope"),
      "password",
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(await response.text(), /isn&#39;t right/);
  });

  it("rejects an empty or oversized form", async () => {
    const empty = await lifecycle.gateResponse(code, post(""), "password");
    assert.equal(empty.status, 400);
    const huge = await lifecycle.gateResponse(
      code,
      post(`password=${"x".repeat(5000)}`),
      "password",
    );
    assert.equal(huge.status, 400);
  });

  it("unlocks with the right password and sends the visitor on", async () => {
    const response = await lifecycle.gateResponse(
      code,
      post("password=open+sesame"),
      "password",
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/p/aB3dE5f");
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^qrdx_unlock_aB3dE5f=\d+\.[\w-]{43}; /);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);

    const token = cookie.split(";")[0]?.split("=")[1];
    assert.equal(lifecycle.verifyUnlockToken(code, token), true);
  });

  it("leaves Secure off on plain http (local dev)", async () => {
    const response = await lifecycle.gateResponse(
      code,
      post("password=open+sesame", "http://localhost:3000/q/aB3dE5f"),
      "password",
    );
    assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /Secure/);
  });
});
