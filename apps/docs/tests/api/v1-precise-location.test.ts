// Precise scan location in the REST API (lib/scan-location): PATCH
// /v1/codes/{id} turns `preciseLocation` on (Pro and Business) or off (any
// plan), codes report it, and GET /v1/codes/{id}/scans includes the shared
// points and per-scan fields only on plans with precise location. The CSV
// export has the same columns. Real routes and lib/scans against in-memory
// tables; side systems are stubbed.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: () => {}, notFound: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
// The daily series and breakdowns are Postgres-specific (tests/api/
// v1-scans-themes.test.ts covers them); precise locations run for real.
vi.mock("@/lib/scans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scans")>();
  return {
    ...actual,
    getScanAnalytics: async (_codeId: string, days: number) => ({
      from: actual.rangeStart(days),
      days,
      total: 4,
      unique: 1,
      series: [],
      countries: [],
      cities: [],
      devices: [],
      os: [],
      browsers: [],
      referrers: [],
    }),
  };
});
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));

const one = await import("@/app/api/v1/codes/[id]/route");
const scansRoute = await import("@/app/api/v1/codes/[id]/scans/route");
const { scansToCsv } = await import("@/lib/scans");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-11T12:00:00Z");
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function grant(token: string, scopes: string[]) {
  fakeDb.seed("oauthToken", [
    {
      id: `tok_${token}`,
      accessTokenHash: sha256(token),
      appId: "app_1",
      userId: "u_alice",
      scopes,
      accessTokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
      revokedAt: null,
    },
  ]);
}

const scanBase = {
  qrCodeId: "code_1",
  country: "US",
  region: "NY",
  city: "New York",
  deviceType: "mobile",
  os: "iOS",
  browser: "Safari",
  referer: null,
  visitorHash: "h",
  language: "en-us",
  variant: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.seed("user", [{ id: "u_alice", banned: false, banExpires: null }]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  grant("read", ["codes:read"]);
  grant("write", ["codes:write"]);
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: "u_alice",
      organizationId: null,
      slug: "Menu123",
      slugScope: "",
      kind: "redirect",
      destinationUrl: "https://cafe.example/menu",
      title: "Menu",
      contentType: "url",
      style: null,
      domainId: null,
      pageId: null,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      scanCount: 4,
      lastScannedAt: NOW,
      pixels: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.seed("qrScan", [
    {
      ...scanBase,
      id: "s1",
      scannedAt: new Date("2026-11-10T10:00:00Z"),
      latitude: 40.758,
      longitude: -73.986,
      locationAccuracyM: 20,
      locationSource: "gps",
    },
    {
      ...scanBase,
      id: "s2",
      scannedAt: new Date("2026-11-10T11:00:00Z"),
      latitude: 40.758,
      longitude: -73.986,
      locationAccuracyM: 40,
      locationSource: "gps",
    },
    {
      ...scanBase,
      id: "s3",
      scannedAt: new Date("2026-11-10T12:00:00Z"),
      latitude: null,
      longitude: null,
      locationAccuracyM: null,
      locationSource: "ip",
    },
    {
      ...scanBase,
      id: "s4",
      scannedAt: new Date("2026-11-10T13:00:00Z"),
      latitude: null,
      longitude: null,
      locationAccuracyM: null,
      locationSource: null,
    },
  ]);
  state.plan = "free";
});

afterEach(() => {
  vi.useRealTimers();
});

const patch = (body: unknown) =>
  one.PATCH(
    new NextRequest(new URL("/api/v1/codes/code_1", ORIGIN), {
      method: "PATCH",
      headers: {
        authorization: "Bearer write",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "code_1" }) },
  );

const getScans = (query = "") =>
  scansRoute.GET(
    new NextRequest(new URL(`/api/v1/codes/code_1/scans${query}`, ORIGIN), {
      headers: { authorization: "Bearer read" },
    }),
    { params: Promise.resolve({ id: "code_1" }) },
  );

const storedPixels = () => fakeDb.find("qrCode", { id: "code_1" })?.pixels;

describe("PATCH /v1/codes/{id} preciseLocation", () => {
  it("needs Pro or Business to turn on", async () => {
    const response = await patch({ preciseLocation: true });
    expect(response.status).toBe(402);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe("PLAN_REQUIRED");
    expect(body.message).toContain("Pro");
    expect(storedPixels()).toBeNull();
  });

  it("turns on and off, keeping other tracking settings", async () => {
    state.plan = "pro";
    const code = fakeDb.find("qrCode", { id: "code_1" });
    if (code) code.pixels = { consent: "auto", conversions: true };
    const on = await patch({ preciseLocation: true });
    expect(on.status).toBe(200);
    expect(
      ((await on.json()) as { data: { preciseLocation: boolean } }).data,
    ).toMatchObject({ preciseLocation: true });
    expect(storedPixels()).toMatchObject({
      conversions: true,
      preciseLocation: true,
    });

    // Off never needs the plan.
    state.plan = "free";
    const off = await patch({ preciseLocation: false });
    expect(off.status).toBe(200);
    expect(
      ((await off.json()) as { data: { preciseLocation: boolean } }).data,
    ).toMatchObject({ preciseLocation: false });
    expect(storedPixels()).toEqual({ consent: "auto", conversions: true });
  });

  it("refuses non-boolean values", async () => {
    state.plan = "pro";
    expect((await patch({ preciseLocation: "yes" })).status).toBe(400);
  });
});

describe("GET /v1/codes/{id}/scans precise locations", () => {
  it("lists shared points and how many scanners were asked, on Pro", async () => {
    state.plan = "pro";
    const response = await getScans("?limit=10");
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: {
        preciseLocations: {
          asked: number;
          shared: number;
          points: Record<string, unknown>[];
        } | null;
        events: Record<string, unknown>[];
      };
    };
    expect(data.preciseLocations).toEqual({
      asked: 3,
      shared: 2,
      points: [
        {
          latitude: 40.758,
          longitude: -73.986,
          count: 2,
          accuracyM: 30,
          lastScannedAt: "2026-11-10T11:00:00.000Z",
        },
      ],
    });
    expect(data.events[3]).toMatchObject({
      latitude: 40.758,
      longitude: -73.986,
      locationAccuracyM: 20,
      locationSource: "gps",
    });
    expect(data.events[1]).toMatchObject({
      latitude: null,
      locationSource: "ip",
    });
  });

  it("leaves them out on Free", async () => {
    const { data } = (await (await getScans("?limit=10")).json()) as {
      data: {
        preciseLocations: unknown;
        events: Record<string, unknown>[];
      };
    };
    expect(data.preciseLocations).toBeNull();
    for (const event of data.events) {
      expect(event).toMatchObject({
        latitude: null,
        longitude: null,
        locationAccuracyM: null,
        locationSource: null,
      });
    }
  });
});

describe("CSV export", () => {
  it("has the precise location columns", () => {
    const csv = scansToCsv([
      {
        scannedAt: NOW,
        country: "US",
        region: "NY",
        city: "New York",
        deviceType: "mobile",
        os: "iOS",
        browser: "Safari",
        referer: null,
        latitude: 40.758,
        longitude: -73.986,
        locationAccuracyM: 20,
        locationSource: "gps",
      },
    ]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe(
      "scanned_at,country,region,city,device_type,os,browser,referrer,latitude,longitude,location_accuracy_m,location_source",
    );
    expect(row).toBe(
      "2026-11-11T12:00:00.000Z,US,NY,New York,mobile,iOS,Safari,,40.758,-73.986,20,gps",
    );
  });
});
