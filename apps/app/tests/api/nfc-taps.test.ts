// NFC taps: a code's NFC link is its short link with `?nfc`
// (lib/nfc/links.ts). It must resolve exactly like the short link printed
// in the QR code, and store the visit with source "nfc"; the plain short link
// keeps storing "qr". On a custom domain the marker survives the rewrite to
// /q/<slug> (host-routing.ts). Runs the real /q pipeline on in-memory tables.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  afterQueue: [] as (() => unknown)[],
  hits: new Map<string, number>(),
  emitted: [] as { source: unknown }[],
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
  emitScanRecorded: async (scan: { source: unknown }) => {
    state.emitted.push({ source: scan.source });
  },
}));

const route = await import("@/app/q/[slug]/route");
const { routeCustomDomain } = await import(
  "@/app/(app)/dashboard/domains/_lib/host-routing"
);

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-11T12:00:00Z");
const PHONE =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

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

async function visit(
  path: string,
  {
    method = "GET",
    headers = {},
  }: { method?: "GET" | "HEAD"; headers?: Record<string, string> } = {},
) {
  const url = new URL(path, ORIGIN);
  const slug = url.pathname.split("/").at(-1) ?? "";
  const request = new NextRequest(url, {
    method,
    headers: {
      "user-agent": PHONE,
      "x-real-ip": `203.0.113.${ipSeq}`,
      ...headers,
    },
  });
  const response = await route[method](request, {
    params: Promise.resolve({ slug }),
  });
  for (const task of state.afterQueue.splice(0)) await task();
  return response;
}

const scans = () => fakeDb.rows("qrScan");

describe("the NFC link", () => {
  it("redirects exactly like the short link and stores an NFC tap", async () => {
    seedCode();
    const tap = await visit("/q/Menu123?nfc");
    expect(tap.status).toBe(302);
    expect(tap.headers.get("location")).toBe("https://cafe.example/menu");
    expect(tap.headers.get("cache-control")).toBe("no-store");
    expect(scans()).toHaveLength(1);
    expect(scans()[0]).toMatchObject({ qrCodeId: "code_1", source: "nfc" });
    expect(fakeDb.find("qrCode", { id: "code_1" })?.scanCount).toBe(1);
    expect(state.emitted).toEqual([{ source: "nfc" }]);
  });

  it("opens hosted pages (vCard Plus cards) the same way", async () => {
    seedCode({ kind: "page" });
    const tap = await visit("/q/Menu123?nfc");
    expect(tap.status).toBe(302);
    expect(tap.headers.get("location")).toBe("/p/Menu123");
    expect(scans()[0]?.source).toBe("nfc");
  });

  it("doesn't count a HEAD request or a bot, like any short link", async () => {
    seedCode();
    await visit("/q/Menu123?nfc", { method: "HEAD" });
    await visit("/q/Menu123?nfc", {
      headers: {
        "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
      },
    });
    expect(scans()).toHaveLength(0);
  });
});

describe("the plain short link (every printed QR code)", () => {
  it("resolves as before and stores a QR scan", async () => {
    seedCode();
    const scan = await visit("/q/Menu123");
    expect(scan.status).toBe(302);
    expect(scan.headers.get("location")).toBe("https://cafe.example/menu");
    expect(scans()[0]).toMatchObject({ qrCodeId: "code_1", source: "qr" });
    expect(state.emitted).toEqual([{ source: "qr" }]);
  });

  it("stays a QR scan with other query parameters", async () => {
    seedCode();
    const scan = await visit("/q/Menu123?utm_source=flyer");
    expect(scan.headers.get("location")).toBe("https://cafe.example/menu");
    expect(scans()[0]?.source).toBe("qr");
  });

  it("answers the same for the NFC link and the short link", async () => {
    seedCode({ archivedAt: new Date("2026-11-01T00:00:00Z") });
    const plain = await visit("/q/Menu123");
    const tap = await visit("/q/Menu123?nfc");
    expect(tap.status).toBe(plain.status);
    expect(await tap.text()).toBe(await plain.text());
  });
});

describe("on a custom domain", () => {
  const rewrite = (path: string) =>
    routeCustomDomain(
      new NextRequest(new URL(path, "https://go.brand.com"), {
        headers: { host: "go.brand.com" },
      }),
    );
  const target = (response: Response | null) => {
    const value = response?.headers.get("x-middleware-rewrite");
    if (!value) return null;
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  };

  beforeEach(() => {
    fakeDb.seed("customDomain", [
      { id: "dom_brand", hostname: "go.brand.com", verified: true },
    ]);
  });

  it("keeps the NFC marker when it rewrites to the short link", async () => {
    expect(target(await rewrite("/spring-menu?nfc"))).toBe(
      "/q/spring-menu?nfc",
    );
  });

  it("rewrites plain links and hosted pages exactly as before", async () => {
    expect(target(await rewrite("/spring-menu"))).toBe("/q/spring-menu");
    expect(target(await rewrite("/spring-menu?utm_source=x"))).toBe(
      "/q/spring-menu",
    );
    expect(target(await rewrite("/p/spring-menu?nfc"))).toBe("/p/spring-menu");
  });
});
