// What a scanner gets from a dynamic code's short link, /q/<slug>
// (app/q/[slug]/route.ts), as content/docs/dynamic-qr-codes.mdx and
// code-controls.mdx describe it: a temporary, uncached redirect; "no longer
// active" (410) for archived, trashed and disabled codes; "not found" (404)
// for unknown links; neutral pages or the fallback URL for paused, ended and
// over-limit codes; a password gate; and one scan recorded per real visit
// (no bots, previews, prefetches or HEADs). Runs the real pipeline (lookup,
// lifecycle, routing, scan recording) against in-memory tables.
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

const state = vi.hoisted(() => ({
  afterQueue: [] as (() => unknown)[],
  // Each limiter counts hits per key against its own maximum.
  hits: new Map<string, number>(),
  emitted: [] as { scanCount: number; qrCodeId: string }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
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
vi.mock("@/lib/events/emit", () => ({
  emitScanRecorded: async (
    scan: { qrCodeId: string },
    code: { scanCount: number },
  ) => {
    state.emitted.push({ qrCodeId: scan.qrCodeId, scanCount: code.scanCount });
  },
}));

const route = await import("@/app/q/[slug]/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-01T12:00:00Z");
const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PASSWORD_HASH = bcrypt.hashSync("open sesame", 4);

let ipSeq = 0;
function seedCode(overrides: Record<string, unknown> = {}) {
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: "u_alice",
      organizationId: null,
      slug: "Menu123",
      kind: "redirect",
      destinationUrl: "https://cafe.example/menu",
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
      pixels: null,
      title: "Menu",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.afterQueue = [];
  state.hits.clear();
  state.emitted = [];
  ipSeq += 1;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Visit {
  method?: "GET" | "HEAD" | "POST";
  ip?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function visit(slug: string, visitOptions: Visit = {}) {
  const { method = "GET", ip = `203.0.113.${ipSeq}`, body } = visitOptions;
  const request = new NextRequest(new URL(`/q/${slug}`, ORIGIN), {
    method,
    headers: {
      "user-agent": PHONE,
      "x-real-ip": ip,
      ...visitOptions.headers,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const handler = route[method];
  const response = await handler(request, {
    params: Promise.resolve({ slug }),
  });
  // Work scheduled with after() runs once the response is out.
  for (const task of state.afterQueue.splice(0)) await task();
  return response;
}

const scans = () => fakeDb.rows("qrScan");
const stored = () => fakeDb.find("qrCode", { id: "code_1" });

// ─── Redirecting ────────────────────────────────────────────────────────────

describe("an active code", () => {
  it("redirects temporarily (never 301) and uncached", async () => {
    seedCode();
    const response = await visit("Menu123");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://cafe.example/menu");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("follows a changed destination on the very next scan", async () => {
    seedCode();
    await visit("Menu123");
    const row = stored();
    if (row) row.destinationUrl = "https://cafe.example/winter-menu";
    const response = await visit("Menu123");
    expect(response.headers.get("location")).toBe(
      "https://cafe.example/winter-menu",
    );
  });

  it("sends hosted-page codes to /p/<slug> on the host that was scanned", async () => {
    seedCode({ kind: "page" });
    const response = await visit("Menu123");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/p/Menu123");
  });

  it("keeps redirecting whatever the owner's plan (no plan lookup at all)", async () => {
    seedCode({ userId: "u_lapsed" });
    expect((await visit("Menu123")).status).toBe(302);
  });
});

// ─── Scans ──────────────────────────────────────────────────────────────────

describe("scan recording", () => {
  it("records one scan per visit, after the redirect, without touching updatedAt", async () => {
    seedCode();
    const response = await visit("Menu123", {
      headers: {
        "x-vercel-ip-country": "fr",
        "x-vercel-ip-city": "Paris",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.5",
        referer: "https://instagram.com/some/path?secret=1",
      },
    });
    expect(response.status).toBe(302);
    expect(scans()).toHaveLength(1);
    expect(scans()[0]).toMatchObject({
      qrCodeId: "code_1",
      scannedAt: NOW,
      country: "FR",
      city: "Paris",
      deviceType: "mobile",
      referer: "instagram.com",
    });
    // Only the referrer's host is kept, never the path or query.
    expect(JSON.stringify(scans()[0])).not.toContain("secret");
    expect(stored()).toMatchObject({
      scanCount: 1,
      lastScannedAt: NOW,
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
    expect(state.emitted).toEqual([{ qrCodeId: "code_1", scanCount: 1 }]);
  });

  it("never stores the visitor's IP address", async () => {
    seedCode();
    await visit("Menu123", { ip: "198.51.100.77" });
    expect(JSON.stringify(scans())).not.toContain("198.51.100.77");
  });

  it("counts different visitors separately", async () => {
    seedCode();
    await visit("Menu123", { ip: "198.51.100.1" });
    await visit("Menu123", { ip: "198.51.100.2" });
    expect(stored()?.scanCount).toBe(2);
  });

  it("redirects bots, link previews and prefetches without counting them", async () => {
    seedCode();
    const visits: Visit[] = [
      {
        headers: {
          "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
        },
      },
      {
        headers: {
          "user-agent":
            "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
        },
      },
      { headers: { "user-agent": "facebookexternalhit/1.1" } },
      { headers: { "user-agent": "" } },
      { headers: { "sec-purpose": "prefetch;prerender" } },
      { headers: { purpose: "prefetch" } },
    ];
    for (const options of visits) {
      const response = await visit("Menu123", options);
      expect(response.status, JSON.stringify(options.headers)).toBe(302);
    }
    expect(scans()).toHaveLength(0);
    expect(stored()?.scanCount).toBe(0);
  });

  it("doesn't count HEAD requests", async () => {
    seedCode();
    const response = await visit("Menu123", { method: "HEAD" });
    expect(response.status).toBe(302);
    expect(scans()).toHaveLength(0);
  });

  it("doesn't count rapid repeats from one device beyond 20 a minute", async () => {
    seedCode();
    for (let i = 0; i < 25; i++) {
      expect((await visit("Menu123", { ip: "198.51.100.9" })).status).toBe(302);
    }
    expect(stored()?.scanCount).toBe(20);
  });

  it("still redirects when recording fails", async () => {
    seedCode();
    vi.spyOn(
      repoDatabase.database as { batch: () => unknown },
      "batch",
    ).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await visit("Menu123");
    expect(response.status).toBe(302);
  });
});

// ─── Codes that don't redirect ──────────────────────────────────────────────

describe("codes that are off", () => {
  it.each([
    ["archived", { archivedAt: NOW }],
    ["trashed", { deletedAt: NOW }],
    ["disabled by an admin", { isActive: false }],
  ])("shows 'no longer active' (410) when %s", async (_label, overrides) => {
    seedCode(overrides);
    const response = await visit("Menu123");
    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
    const html = await response.text();
    expect(html).toContain("This QR code is no longer active");
    expect(html).not.toContain("cafe.example");
  });

  it("shows 'not found' (404) for unknown, malformed and reserved slugs", async () => {
    seedCode();
    for (const slug of ["Nope123", "short", "Menu1234", "settings", "../etc"]) {
      const response = await visit(slug);
      expect(response.status, slug).toBe(404);
      expect(await response.text()).toContain("QR code not found");
    }
  });

  it("looks slugs up case-sensitively", async () => {
    seedCode();
    expect((await visit("menu123")).status).toBe(404);
  });

  it("answers 503, not a broken redirect, when the lookup fails", async () => {
    seedCode();
    vi.spyOn(
      repoDatabase.database as { select: () => unknown },
      "select",
    ).mockImplementation(() => {
      throw new Error("db down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await visit("Menu123");
    expect(response.status).toBe(503);
  });
});

// ─── Lifecycle controls ─────────────────────────────────────────────────────

describe("paused, scheduled and limited codes", () => {
  it("shows a neutral 'paused' page, or the fallback URL", async () => {
    seedCode({ pausedAt: NOW });
    const page = await visit("Menu123");
    expect(page.headers.get("location")).toBeNull();
    const html = await page.text();
    expect(html.toLowerCase()).toContain("paused");
    expect(html).not.toContain("cafe.example/menu");
    expect(html).toContain("Report abuse");

    fakeDb.reset();
    seedCode({ pausedAt: NOW, fallbackUrl: "https://cafe.example/next" });
    const redirect = await visit("Menu123");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("https://cafe.example/next");
  });

  it("asks scanners to come back before the start date, never using the fallback", async () => {
    seedCode({
      startsAt: new Date(NOW.getTime() + 3_600_000),
      fallbackUrl: "https://cafe.example/next",
    });
    const response = await visit("Menu123");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toMatch(
      /hasn(?:'|&#39;|&#x27;)t started yet/,
    );

    vi.setSystemTime(NOW.getTime() + 3_600_000);
    expect((await visit("Menu123")).headers.get("location")).toBe(
      "https://cafe.example/menu",
    );
  });

  it("ends at the end date: fallback URL or 'This campaign has ended'", async () => {
    seedCode({ expiresAt: NOW });
    const ended = await visit("Menu123");
    expect(ended.status).toBe(410);
    expect(await ended.text()).toContain("This campaign has ended");

    fakeDb.reset();
    seedCode({
      expiresAt: new Date(NOW.getTime() + 1000),
      fallbackUrl: "https://cafe.example/next",
    });
    expect((await visit("Menu123")).headers.get("location")).toBe(
      "https://cafe.example/menu",
    );
    vi.setSystemTime(NOW.getTime() + 1000);
    expect((await visit("Menu123")).headers.get("location")).toBe(
      "https://cafe.example/next",
    );
  });

  it("allows exactly `scanLimit` counted scans, then ends", async () => {
    seedCode({ scanLimit: 2, fallbackUrl: "https://cafe.example/sold-out" });
    const locations: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      locations.push(
        (await visit("Menu123", { ip: `198.51.100.${i + 10}` })).headers.get(
          "location",
        ),
      );
    }
    expect(locations).toEqual([
      "https://cafe.example/menu",
      "https://cafe.example/menu",
      "https://cafe.example/sold-out",
      "https://cafe.example/sold-out",
    ]);
  });

  it("doesn't let uncounted visits (bots) use up the limit", async () => {
    seedCode({ scanLimit: 1 });
    await visit("Menu123", { headers: { "user-agent": "Googlebot/2.1" } });
    await visit("Menu123", { method: "HEAD" });
    expect((await visit("Menu123")).headers.get("location")).toBe(
      "https://cafe.example/menu",
    );
  });
});

describe("password-protected codes", () => {
  const unlock = (password: string, ip?: string) =>
    visit("Menu123", {
      method: "POST",
      body: new URLSearchParams({ password }).toString(),
      ip,
    });

  it("shows the password form instead of redirecting", async () => {
    seedCode({ passwordHash: PASSWORD_HASH });
    const response = await visit("Menu123");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    const html = await response.text();
    expect(html).toContain('<form method="post">');
    expect(html).toContain('type="password"');
    expect(html).not.toContain("cafe.example");
  });

  it("refuses a wrong password (401) and an empty one (400)", async () => {
    seedCode({ passwordHash: PASSWORD_HASH });
    const wrong = await unlock("guess");
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("location")).toBeNull();
    expect(await wrong.text()).toMatch(/isn(?:'|&#39;|&#x27;)t right/);
    expect((await unlock("")).status).toBe(400);
  });

  it("unlocks with the right password, and the cookie keeps it unlocked", async () => {
    seedCode({ passwordHash: PASSWORD_HASH });
    const gate = await visit("Menu123", { ip: "198.51.100.50" });
    expect(gate.status).toBe(200);
    expect(scans()).toHaveLength(1);

    const response = await unlock("open sesame", "198.51.100.50");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://cafe.example/menu");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    // The GET that showed the form already counted this visit.
    expect(scans()).toHaveLength(1);

    const again = await visit("Menu123", {
      headers: { cookie: cookie.split(";")[0] as string },
    });
    expect(again.status).toBe(302);
    expect(again.headers.get("location")).toBe("https://cafe.example/menu");
  });

  it("doesn't accept another code's unlock cookie", async () => {
    seedCode({ passwordHash: PASSWORD_HASH });
    fakeDb.seed("qrCode", [
      {
        ...stored(),
        id: "code_2",
        slug: "Other12",
        destinationUrl: "https://secret.example",
      },
    ]);
    const cookie =
      (await unlock("open sesame")).headers.get("set-cookie")?.split(";")[0] ??
      "";
    const other = await visit("Other12", {
      headers: { cookie: cookie.replace("Menu123", "Other12") },
    });
    expect(other.status).toBe(200);
    expect(other.headers.get("location")).toBeNull();
  });

  it("slows down password guessing (429 after 10 tries)", async () => {
    seedCode({ passwordHash: PASSWORD_HASH });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await unlock(`guess-${i}`, "198.51.100.66")).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Even the right password waits.
    expect((await unlock("open sesame", "198.51.100.66")).status).toBe(429);
  });
});

// ─── Custom domains and abuse ───────────────────────────────────────────────

describe("custom domains", () => {
  const onDomain = (domainId: string) => ({
    headers: { "x-qrdx-custom-domain": domainId },
  });

  it("resolves only that domain's codes on a custom domain", async () => {
    seedCode({ domainId: "dom_brand" });
    expect((await visit("Menu123", onDomain("dom_brand"))).status).toBe(302);
    expect((await visit("Menu123", onDomain("dom_other"))).status).toBe(404);
  });

  it("keeps the default short link working after a move to a custom domain", async () => {
    seedCode({ domainId: "dom_brand" });
    expect((await visit("Menu123")).status).toBe(302);
  });
});

describe("enumeration protection", () => {
  it("answers 429 once one IP opens more than 120 links in 10 seconds", async () => {
    seedCode();
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (
        await visit(i === 120 ? "Menu123" : "Nope123", { ip: "198.51.100.200" })
      ).status;
    }
    expect(last).toBe(429);
    // Other visitors are unaffected.
    expect((await visit("Menu123", { ip: "198.51.100.201" })).status).toBe(302);
  });
});
