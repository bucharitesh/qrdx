// The Analytics tab's CSV export (dashboard/[workspace]/codes/[id]/export):
// the scans of the selected range, newest first. range=all (Pro and
// Business) reaches back to the code's first scan; Free keeps its 1-year
// history and gets 30 days instead. Codes live in memory; the scan listing
// itself (Postgres-specific) is a recorder.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
  listCalls: [] as { codeId: string; from: Date; limit: number }[],
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
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, pending: Promise.resolve() }),
  }),
}));
vi.mock("@/lib/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scope")>()),
  getActiveScope: async () => ({
    userId: "u_ana",
    organizationId: "org_acme",
    role: "owner",
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/scans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scans")>();
  return {
    ...actual,
    listScans: async (
      codeId: string,
      options: { from: Date; limit: number },
    ) => {
      state.listCalls.push({ codeId, ...options });
      return [
        {
          scannedAt: new Date("2026-10-31T09:00:00Z"),
          country: "DE",
          region: null,
          city: "Berlin",
          deviceType: "mobile",
          os: "iOS",
          browser: "Safari",
          referer: null,
          source: "qr",
          latitude: null,
          longitude: null,
          locationAccuracyM: null,
          locationSource: null,
        },
      ];
    },
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const exportRoute = await import(
  "@/app/(app)/dashboard/[workspace]/codes/[id]/export/route"
);

const NOW = new Date("2026-11-01T12:00:00Z");
const MADE = new Date("2022-08-01T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.seed("qrCode", [
    {
      id: "c_menu",
      userId: "u_ana",
      organizationId: "org_acme",
      slug: "menu",
      slugScope: "",
      kind: "redirect",
      contentType: "url",
      destinationUrl: "https://example.com",
      title: "Menu",
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      domainId: null,
      pageId: null,
      style: null,
      scanCount: 2,
      lastScannedAt: null,
      createdAt: MADE,
      updatedAt: MADE,
    },
  ]);
  state.plan = "free";
  state.listCalls = [];
});

afterEach(() => {
  vi.useRealTimers();
});

const exportCsv = (query: string) =>
  exportRoute.GET(
    new NextRequest(
      new URL(`/dashboard/acme/codes/c_menu/export${query}`, "http://x"),
    ),
    { params: Promise.resolve({ id: "c_menu" }) },
  );

describe("scan CSV export", () => {
  it("exports the whole history with range=all on Pro, from the first scan", async () => {
    state.plan = "pro";
    fakeDb.seed("qrScan", [
      {
        id: "s_first",
        qrCodeId: "c_menu",
        scannedAt: new Date("2022-08-17T22:30:00Z"),
      },
      {
        id: "s_last",
        qrCodeId: "c_menu",
        scannedAt: new Date("2026-10-31T09:00:00Z"),
      },
    ]);
    const response = await exportCsv("?range=all");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="qrdx-menu-scans-all.csv"',
    );
    expect(state.listCalls).toHaveLength(1);
    expect(state.listCalls[0]?.from.toISOString()).toBe(
      "2022-08-17T00:00:00.000Z",
    );
    const csv = await response.text();
    expect(csv.split("\r\n")[0]).toMatch(/^scanned_at,country,/);
    expect(csv).toContain("2026-10-31T09:00:00.000Z,DE,,Berlin");
  });

  it("starts at the code's creation when it has no scans yet", async () => {
    state.plan = "business";
    await exportCsv("?range=all");
    expect(state.listCalls[0]?.from.toISOString()).toBe(
      "2022-08-01T00:00:00.000Z",
    );
  });

  it("gives Free 30 days instead of All time", async () => {
    const response = await exportCsv("?range=all");
    expect(response.headers.get("content-disposition")).toContain(
      "scans-30d.csv",
    );
    expect(state.listCalls[0]?.from.toISOString()).toBe(
      "2026-10-03T00:00:00.000Z",
    );
  });

  it("keeps fixed ranges as they were", async () => {
    state.plan = "pro";
    const response = await exportCsv("?range=365d");
    expect(response.headers.get("content-disposition")).toContain(
      "scans-365d.csv",
    );
    expect(state.listCalls[0]?.from.toISOString()).toBe(
      "2025-11-02T00:00:00.000Z",
    );
  });
});
