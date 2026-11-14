// Precise scan location end to end (lib/scan-location): what a scanner gets
// from /q/<slug> when the owner turned "Ask scanners for precise location"
// on or off, and what /api/scan-location stores. Runs the real redirect
// pipeline, plan lookup and scan recording against in-memory tables
// (tests/support/fake-db); nothing touches a database or the network.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  afterQueue: [] as (() => unknown)[],
  hits: new Map<string, number>(),
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
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.afterQueue.push(task);
  },
}));
vi.mock("@repo/rate-limit", () => {
  let next = 0;
  return {
    slidingWindow: (max: number) => ({ max }),
    createRateLimiter: ({ limiter }: { limiter: { max: number } }) => {
      const id = next++;
      return {
        limit: async (key: string) => {
          const count = (state.hits.get(`${id}:${key}`) ?? 0) + 1;
          state.hits.set(`${id}:${key}`, count);
          return {
            success: count <= limiter.max,
            limit: limiter.max,
            remaining: Math.max(0, limiter.max - count),
            reset: Date.now() + 10_000,
            pending: Promise.resolve(),
          };
        },
      };
    },
  };
});
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/lib/events/emit", () => ({ emitScanRecorded: async () => {} }));

const shortLink = await import("@/app/q/[slug]/route");
const endpoint = await import("@/app/api/scan-location/route");
const { LOCATION_COOKIE } = await import("@/lib/scan-location/server");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-11T12:00:00Z");
const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESTINATION = "https://cafe.example/menu";
const VENUE = { latitude: 40.758, longitude: -73.9855 };

let ipSeq = 0;
function seedCode(overrides: Record<string, unknown> = {}) {
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: "u_alice",
      organizationId: null,
      slug: "Menu123",
      slugScope: "",
      kind: "redirect",
      destinationUrl: DESTINATION,
      domainId: null,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      scanCount: 0,
      lastScannedAt: null,
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      pausedAt: null,
      fallbackUrl: null,
      routing: null,
      utm: null,
      pixels: { consent: "auto", conversions: false, preciseLocation: true },
      title: "Menu",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      ...overrides,
    },
  ]);
}

/** Alice's own workspace on Pro (any unconfigured product counts as Pro). */
function onPro(userId = "u_alice") {
  fakeDb.seed("subscription", [
    {
      id: `sub_${userId}`,
      userId,
      status: "active",
      productId: "pro-monthly",
      createdAt: NOW,
    },
  ]);
}

const AREA_RULES = {
  version: 1,
  rules: [
    {
      id: "venue",
      enabled: true,
      conditions: [{ type: "geofence", ...VENUE, radius: 500 }],
      action: { type: "redirect", url: "https://cafe.example/on-site" },
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.afterQueue = [];
  state.hits.clear();
  ipSeq += 1;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function drainAfter() {
  for (const task of state.afterQueue.splice(0)) await task();
}

async function scan(
  slug = "Menu123",
  {
    method = "GET",
    headers = {},
  }: { method?: "GET" | "HEAD"; headers?: Record<string, string> } = {},
) {
  const request = new NextRequest(new URL(`/q/${slug}`, ORIGIN), {
    method,
    headers: {
      "user-agent": PHONE,
      "x-real-ip": `203.0.113.${ipSeq}`,
      ...headers,
    },
  });
  const response = await shortLink[method](request, {
    params: Promise.resolve({ slug }),
  });
  await drainAfter();
  return response;
}

async function share(body: Record<string, unknown>) {
  const request = new NextRequest(new URL("/api/scan-location", ORIGIN), {
    method: "POST",
    headers: {
      "user-agent": PHONE,
      "x-real-ip": `203.0.113.${ipSeq}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const response = await endpoint.POST(request);
  await drainAfter();
  return response;
}

/** The step page's embedded data (token, next). */
async function stepData(response: Response) {
  const html = await response.text();
  const match = /window\.__qrdxLocation=(\{.*?\});/.exec(html);
  if (!match) throw new Error("No location step data in the page");
  return {
    html,
    data: JSON.parse(match[1] as string) as { token: string; next: string },
  };
}

const scans = () => fakeDb.rows("qrScan");

// ─── Off by default: exactly today's redirect ───────────────────────────────

describe("with the setting off", () => {
  it("redirects straight away: no step, no cookie, no plan lookup, nothing extra stored", async () => {
    seedCode({ pixels: null });
    // Any plan query would throw: proves the off path never looks.
    fakeDb.missing("subscription", "member");
    const response = await scan();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("content-type")).toBeNull();
    expect(scans()).toHaveLength(1);
    expect(scans()[0]).not.toHaveProperty("locationSource");
    expect(scans()[0]).not.toHaveProperty("latitude");
  });

  it("stays off when other tracking settings are saved", async () => {
    seedCode({
      pixels: { consent: "auto", conversions: false, preciseLocation: false },
    });
    fakeDb.missing("subscription", "member");
    const response = await scan();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(DESTINATION);
  });

  it("keeps hosted pages a plain redirect too", async () => {
    seedCode({ kind: "page", pixels: null });
    fakeDb.missing("subscription", "member");
    const response = await scan();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/p/Menu123");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("ignores a location posted for its scans", async () => {
    seedCode({ pixels: null });
    const response = await scan();
    expect(response.status).toBe(302);
    const { signLocationToken } = await import("@/lib/scan-location/token");
    const id = scans()[0]?.id as string;
    const reply = await share({
      token: signLocationToken(id, "code_1", NOW),
      latitude: 40.7128,
      longitude: -74.006,
      accuracy: 20,
    });
    expect(await reply.json()).toEqual({ url: null });
    expect(scans()[0]).not.toHaveProperty("latitude");
  });
});

// ─── On: the location step for redirect codes ───────────────────────────────

describe("the location step (redirect codes)", () => {
  it("asks before the redirect, with Skip going straight to the destination", async () => {
    seedCode();
    onPro();
    const response = await scan();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'nonce-");
    expect(csp).toContain("connect-src 'self'");
    const { html, data } = await stepData(response);
    expect(html).toContain("Share your location?");
    expect(html).toContain('<button id="allow" type="button">Allow</button>');
    expect(html).toContain(`<a id="skip" href="${DESTINATION}"`);
    // Without JavaScript it continues at once.
    expect(html).toContain(
      `<noscript><meta http-equiv="refresh" content="0;url=${DESTINATION}"></noscript>`,
    );
    expect(data.next).toBe(DESTINATION);
    // The scan is counted once, marked as asked.
    expect(scans()).toHaveLength(1);
    expect(scans()[0]).toMatchObject({
      qrCodeId: "code_1",
      locationSource: "ip",
    });
    expect(scans()[0]).not.toHaveProperty("latitude");
  });

  it("stores a shared location rounded to 3 decimals, once", async () => {
    seedCode();
    onPro();
    const { data } = await stepData(await scan());
    const reply = await share({
      token: data.token,
      latitude: 40.712812345,
      longitude: -74.006049,
      accuracy: 23.6,
    });
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({ url: DESTINATION });
    expect(scans()[0]).toMatchObject({
      latitude: 40.713,
      longitude: -74.006,
      locationAccuracyM: 24,
      locationSource: "gps",
    });
    expect(JSON.stringify(scans())).not.toContain("40.7128");

    // A second answer for the same scan doesn't move it.
    await share({
      token: data.token,
      latitude: 51.5,
      longitude: -0.12,
      accuracy: 10,
    });
    expect(scans()[0]).toMatchObject({ latitude: 40.713, longitude: -74.006 });
  });

  it("stores nothing more when the scanner skips or declines", async () => {
    seedCode();
    onPro();
    await scan();
    // Skip, a denial or a timeout: the browser just follows the link.
    expect(scans()[0]).toMatchObject({ locationSource: "ip" });
    expect(scans()[0]?.latitude).toBeUndefined();
    expect(scans()[0]?.longitude).toBeUndefined();
  });

  it("refuses forged, expired and out-of-range answers", async () => {
    seedCode();
    onPro();
    const { data } = await stepData(await scan());
    const valid = { token: data.token, latitude: 40.7, longitude: -74 };
    const [scanId, codeId, issued] = data.token.split(".");
    for (const body of [
      { ...valid, token: `${scanId}.${codeId}.${issued}.${"A".repeat(22)}` },
      { ...valid, latitude: 91 },
      { ...valid, longitude: -181 },
      { ...valid, latitude: "40.7" },
      { ...valid, accuracy: 250_000 },
      { latitude: 40.7, longitude: -74 },
    ]) {
      const reply = await share(body);
      expect(reply.status).toBe(400);
    }
    vi.setSystemTime(new Date(NOW.getTime() + 16 * 60_000));
    expect((await share(valid)).status).toBe(400);
    expect(scans()[0]?.latitude).toBeUndefined();
  });

  it("doesn't ask on Free: scans redirect as usual", async () => {
    seedCode();
    const response = await scan();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(DESTINATION);
    expect(scans()[0]).not.toHaveProperty("locationSource");
  });

  it("stops storing when the owner turns it off after the scan", async () => {
    seedCode();
    onPro();
    const { data } = await stepData(await scan());
    const code = fakeDb.find("qrCode", { id: "code_1" });
    if (code) code.pixels = null;
    const reply = await share({ token: data.token, latitude: 1, longitude: 2 });
    expect(await reply.json()).toEqual({ url: null });
    expect(scans()[0]?.latitude).toBeUndefined();
  });

  it("never shows the step to bots, link previews or HEAD requests", async () => {
    seedCode();
    onPro();
    for (const ua of [
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "facebookexternalhit/1.1",
    ]) {
      const response = await scan("Menu123", { headers: { "user-agent": ua } });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(DESTINATION);
    }
    const head = await scan("Menu123", { method: "HEAD" });
    expect(head.status).toBe(302);
  });
});

// ─── Geofence routing ───────────────────────────────────────────────────────

describe("area (geofence) rules", () => {
  it("send a scanner who shares a location inside the area to the rule's URL", async () => {
    seedCode({ routing: AREA_RULES });
    onPro();
    const { data } = await stepData(await scan());
    // Without a location the step continues to the main destination.
    expect(data.next).toBe(DESTINATION);
    const reply = await share({
      token: data.token,
      latitude: 40.7585,
      longitude: -73.9851,
      accuracy: 15,
    });
    expect(await reply.json()).toEqual({
      url: "https://cafe.example/on-site",
    });
  });

  it("keep scanners outside the area on the main destination", async () => {
    seedCode({ routing: AREA_RULES });
    onPro();
    const { data } = await stepData(await scan());
    const reply = await share({
      token: data.token,
      latitude: 34.052,
      longitude: -118.244,
    });
    expect(await reply.json()).toEqual({ url: DESTINATION });
  });

  it("use the network location when the setting is off (on Vercel)", async () => {
    vi.stubEnv("VERCEL", "1");
    seedCode({ routing: AREA_RULES, pixels: null });
    const inside = await scan("Menu123", {
      headers: {
        "x-vercel-ip-latitude": "40.7590",
        "x-vercel-ip-longitude": "-73.9845",
      },
    });
    expect(inside.status).toBe(302);
    expect(inside.headers.get("location")).toBe("https://cafe.example/on-site");
    ipSeq += 1;
    const elsewhere = await scan("Menu123", {
      headers: {
        "x-vercel-ip-latitude": "51.5074",
        "x-vercel-ip-longitude": "-0.1278",
      },
    });
    expect(elsewhere.headers.get("location")).toBe(DESTINATION);
    // Network coordinates are never stored.
    expect(JSON.stringify(scans())).not.toContain("40.759");
  });
});

// ─── Hosted pages ───────────────────────────────────────────────────────────

describe("hosted pages", () => {
  it("open at once, carrying a short-lived token for the in-page ask", async () => {
    seedCode({ kind: "page" });
    onPro();
    const response = await scan();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/p/Menu123");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${LOCATION_COOKIE}=`));
    expect(cookie).toContain("Path=/p/Menu123");
    expect(cookie).toContain("Max-Age=900");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(scans()[0]).toMatchObject({ locationSource: "ip" });

    const token = cookie.split(";")[0]?.split("=")[1] as string;
    const reply = await share({
      token,
      latitude: -33.86881,
      longitude: 151.20929,
      accuracy: 8,
    });
    expect(await reply.json()).toEqual({ ok: true });
    // The answer is in: the cookie goes.
    expect(reply.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(scans()[0]).toMatchObject({
      latitude: -33.869,
      longitude: 151.209,
      locationAccuracyM: 8,
      locationSource: "gps",
    });
  });
});
