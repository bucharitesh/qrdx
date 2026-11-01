// POST /api/v1/conversions as content/docs/tracking-and-conversions.mdx and
// developers/rest-api.mdx describe it: a Business feature that attributes a
// sale or sign-up to the scan that led to it. Browsers report with the signed
// qrdx_sid when tracking is on for the code; servers report with a codes:write
// token, by sid or by code id, for their own workspace only; an `id` makes
// retries idempotent. The route runs for real against in-memory tables.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signScanToken } from "@/lib/redirect/routing";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  /** Plan by workspace: an organization id or a personal user id. */
  plans: {} as Record<string, "free" | "pro" | "business">,
  rateLimited: false,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.rateLimited,
      limit: 60,
      remaining: state.rateLimited ? 0 : 59,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async (scope: {
    userId: string;
    organizationId: string | null;
  }) => state.plans[scope.organizationId ?? scope.userId] ?? "free",
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const conversions = await import("@/app/api/v1/conversions/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-01T12:00:00Z");
const DAY = 86_400_000;

// Scan tokens only carry lowercase cuid-like ids.
const ALICE_CODE = "ckalicecode01";
const ALICE_DARK_CODE = "ckalicecode02";
const BOB_CODE = "ckbobcode0001";
const TEAM_CODE = "ckteamcode001";
const SCAN = "ckscan0000001";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function grant(token: string, userId: string, scopes: string[]) {
  fakeDb.seed("oauthToken", [
    {
      id: `tok_${token}`,
      accessTokenHash: sha256(token),
      appId: "app_1",
      userId,
      scopes,
      accessTokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
      revokedAt: null,
    },
  ]);
}

function code(id: string, overrides: Record<string, unknown> = {}) {
  fakeDb.seed("qrCode", [
    {
      id,
      userId: "u_alice",
      organizationId: null,
      pixels: { consent: "auto", conversions: true },
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.unique("conversion", "id");
  fakeDb.seed("user", [
    { id: "u_alice", banned: false, banExpires: null },
    { id: "u_bob", banned: false, banExpires: null },
  ]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  grant("write-token", "u_alice", ["codes:write"]);
  grant("read-token", "u_alice", ["codes:read"]);
  code(ALICE_CODE);
  code(ALICE_DARK_CODE, { pixels: null });
  code(BOB_CODE, { userId: "u_bob" });
  code(TEAM_CODE, { userId: "u_alice", organizationId: "org_acme" });
  state.plans = {
    u_alice: "business",
    u_bob: "business",
    org_acme: "business",
  };
  state.rateLimited = false;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Requests ───────────────────────────────────────────────────────────────

function report(
  body: unknown,
  { token, raw }: { token?: string; raw?: string } = {},
) {
  return conversions.POST(
    new NextRequest(new URL("/api/v1/conversions", ORIGIN), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        // conversions.js runs on the customer's own site.
        origin: "https://shop.example",
      },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

const sid = (codeId = ALICE_CODE, issuedAt = NOW, scanId = SCAN) =>
  signScanToken(scanId, codeId, issuedAt);

const errorOf = async (response: Response) =>
  (await response.json()) as { code: string; message: string; status: number };

// ─── Server reports ─────────────────────────────────────────────────────────

describe("server reports (Bearer token with codes:write)", () => {
  it("attributes a conversion to the scan in the qrdx_sid", async () => {
    const response = await report(
      {
        sid: sid(),
        name: "purchase",
        value: 49.99,
        currency: "usd",
        id: "ORDER-1234",
        metadata: { plan: "annual", seats: 3 },
      },
      { token: "write-token" },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      id: expect.stringMatching(/^cv_[0-9a-f]{32}$/),
      codeId: ALICE_CODE,
      scanId: SCAN,
      duplicate: false,
    });
    expect(fakeDb.rows("conversion")).toEqual([
      {
        id: body.id,
        qrCodeId: ALICE_CODE,
        scanId: SCAN,
        name: "purchase",
        value: "49.99",
        currency: "USD",
        metadata: {
          plan: "annual",
          seats: 3,
          externalId: "ORDER-1234",
          source: "api",
        },
        createdAt: NOW,
      },
    ]);
  });

  it("accepts the code id when the scan isn't known", async () => {
    const response = await report(
      { code: ALICE_CODE, name: "signup" },
      { token: "write-token" },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      codeId: ALICE_CODE,
      scanId: null,
    });
    expect(fakeDb.rows("conversion")[0]).toMatchObject({
      name: "signup",
      value: null,
      currency: null,
    });
  });

  it("works even when browser tracking is off for the code", async () => {
    const response = await report(
      { code: ALICE_DARK_CODE },
      { token: "write-token" },
    );
    expect(response.status).toBe(201);
    expect(fakeDb.rows("conversion")[0]?.name).toBe("conversion");
  });

  it("needs codes:write", async () => {
    const readOnly = await report(
      { code: ALICE_CODE },
      { token: "read-token" },
    );
    expect(readOnly.status).toBe(403);
    expect((await errorOf(readOnly)).code).toBe("INSUFFICIENT_SCOPE");
    const unknown = await report({ code: ALICE_CODE }, { token: "nope" });
    expect(unknown.status).toBe(401);
    expect(fakeDb.rows("conversion")).toHaveLength(0);
  });

  it("only reaches codes of the token owner's personal workspace", async () => {
    for (const body of [
      { code: BOB_CODE },
      { sid: sid(BOB_CODE) },
      { code: TEAM_CODE },
      { sid: sid(TEAM_CODE) },
      { code: "ckmissing0001" },
    ]) {
      const response = await report(body, { token: "write-token" });
      expect(response.status, JSON.stringify(body)).toBe(404);
      expect((await errorOf(response)).code).toBe("NOT_FOUND");
    }
    expect(fakeDb.rows("conversion")).toHaveLength(0);
  });

  it("asks for a sid or a code", async () => {
    const response = await report(
      { name: "purchase" },
      { token: "write-token" },
    );
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({
      code: "SID_REQUIRED",
      message: "Send the qrdx_sid of the scan, or the code id as `code`.",
    });
  });
});

// ─── Browser reports ────────────────────────────────────────────────────────

describe("browser reports (conversions.js, no credentials)", () => {
  it("records conversions for scans of codes with tracking on", async () => {
    const response = await report({
      sid: sid(),
      name: "purchase",
      value: "19",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(fakeDb.rows("conversion")[0]).toMatchObject({
      qrCodeId: ALICE_CODE,
      scanId: SCAN,
      value: "19",
      currency: "USD",
      metadata: { source: "browser" },
    });
  });

  it("works for team codes on a Business team", async () => {
    expect((await report({ sid: sid(TEAM_CODE) })).status).toBe(201);
  });

  it("needs the signed qrdx_sid, never a bare code id", async () => {
    const bare = await report({ code: ALICE_CODE });
    expect(bare.status).toBe(400);
    expect(await errorOf(bare)).toMatchObject({
      code: "SID_REQUIRED",
      message: "Send the qrdx_sid the QR code added to your page URL.",
    });
    expect((await report({})).status).toBe(400);
  });

  it("refuses forged, altered and expired sids", async () => {
    const valid = sid();
    const [scanId, , issued, signature] = valid.split(".");
    for (const forged of [
      `${scanId}.${BOB_CODE}.${issued}.${signature}`,
      `${valid.slice(0, -1)}${valid.endsWith("A") ? "B" : "A"}`,
      "not-a-token",
      sid(ALICE_CODE, new Date(NOW.getTime() - 31 * DAY)),
    ]) {
      const response = await report({ sid: forged });
      expect(response.status, forged).toBe(404);
      expect((await errorOf(response)).code).toBe("INVALID_SID");
    }
    // Inside the 30-day window.
    expect(
      (
        await report({
          sid: sid(ALICE_CODE, new Date(NOW.getTime() - 29 * DAY)),
        })
      ).status,
    ).toBe(201);
  });

  it("respects the code's tracking switch", async () => {
    const response = await report({ sid: sid(ALICE_DARK_CODE) });
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("CONVERSIONS_OFF");
    code("ckalicecode03", { pixels: { conversions: false } });
    expect((await report({ sid: sid("ckalicecode03") })).status).toBe(403);
  });

  it("rate limits (429)", async () => {
    state.rateLimited = true;
    expect((await report({ sid: sid() })).status).toBe(429);
  });

  it("answers CORS preflights", () => {
    const response = conversions.OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
  });
});

// ─── Plans ──────────────────────────────────────────────────────────────────

describe("the Business plan", () => {
  it("is required of the code's workspace (402 PLAN_REQUIRED)", async () => {
    for (const plan of ["free", "pro"] as const) {
      state.plans.u_alice = plan;
      for (const [body, token] of [
        [{ sid: sid() }, undefined],
        [{ code: ALICE_CODE }, "write-token"],
      ] as const) {
        const response = await report(body, { token });
        expect(response.status, `${plan} ${JSON.stringify(body)}`).toBe(402);
        expect(await errorOf(response)).toMatchObject({
          code: "PLAN_REQUIRED",
          message: "Conversion tracking is part of the Business plan.",
        });
      }
    }
    expect(fakeDb.rows("conversion")).toHaveLength(0);
  });

  it("follows the team's plan for team codes", async () => {
    state.plans = { u_alice: "business", org_acme: "pro" };
    expect((await report({ sid: sid(TEAM_CODE) })).status).toBe(402);
    state.plans = { u_alice: "free", org_acme: "business" };
    expect((await report({ sid: sid(TEAM_CODE) })).status).toBe(201);
  });
});

// ─── Idempotency ────────────────────────────────────────────────────────────

describe("idempotency with `id`", () => {
  it("records the same id once: 201, then 200 with duplicate: true", async () => {
    const order = { sid: sid(), name: "purchase", value: 10, id: "ORDER-1" };
    const first = await report(order);
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const again = await report(order, { token: "write-token" });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ...firstBody, duplicate: true });
    expect(fakeDb.rows("conversion")).toHaveLength(1);
  });

  it("keeps ids per code, and records reports without an id every time", async () => {
    await report({ sid: sid(), id: "ORDER-1" });
    code("ckalicecode04");
    await report({ sid: sid("ckalicecode04"), id: "ORDER-1" });
    await report({ sid: sid() });
    await report({ sid: sid() });
    expect(fakeDb.rows("conversion")).toHaveLength(4);
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe("validation", () => {
  it("takes amounts with up to 2 decimals, never negative", async () => {
    for (const value of [
      -1,
      -0.001,
      "1.234",
      "abc",
      "1e3",
      Number.NaN,
      "",
      "-5",
    ]) {
      const response = await report({ sid: sid(), value });
      expect(response.status, String(value)).toBe(400);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }
    // Numbers are rounded to cents, so float noise like 0.1 + 0.2 is fine;
    // strings must already be exact.
    for (const [value, stored] of [
      [0, "0.00"],
      [12.5, "12.50"],
      [0.1 + 0.2, "0.30"],
      [1.234, "1.23"],
      ["7.25", "7.25"],
      [" 3 ", "3"],
    ] as const) {
      fakeDb.rows("conversion").splice(0);
      expect((await report({ sid: sid(), value })).status).toBe(201);
      expect(fakeDb.rows("conversion")[0]?.value).toBe(stored);
    }
  });

  it("takes ISO 4217 currencies, USD by default with a value", async () => {
    expect(
      (await report({ sid: sid(), value: 5, currency: "US" })).status,
    ).toBe(400);
    expect(
      (await report({ sid: sid(), value: 5, currency: "dollars" })).status,
    ).toBe(400);
    expect(
      (await report({ sid: sid(), value: 5, currency: " eur " })).status,
    ).toBe(201);
    expect(fakeDb.rows("conversion")[0]?.currency).toBe("EUR");
  });

  it("restricts names and metadata", async () => {
    expect((await report({ sid: sid(), name: "<script>" })).status).toBe(400);
    expect((await report({ sid: sid(), name: "x".repeat(65) })).status).toBe(
      400,
    );
    expect(
      (await report({ sid: sid(), name: "checkout:step/2 done" })).status,
    ).toBe(201);
    const tooMany = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`k${i}`, i]),
    );
    expect((await report({ sid: sid(), metadata: tooMany })).status).toBe(400);
    expect(
      (await report({ sid: sid(), metadata: { "bad key": 1 } })).status,
    ).toBe(400);
    expect(
      (await report({ sid: sid(), metadata: { nested: { a: 1 } } })).status,
    ).toBe(400);
  });

  it("caps bodies at 8 KB and rejects broken JSON", async () => {
    expect(
      (await report({ sid: sid(), id: "x".repeat(9 * 1024) })).status,
    ).toBe(413);
    expect((await report(null, { raw: "{oops" })).status).toBe(400);
  });
});
