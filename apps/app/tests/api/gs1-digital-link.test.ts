// GS1 Digital Links on a custom domain (app/gs1/[...path]/route.ts, reached
// through proxy.ts): https://<domain>/01/<GTIN>[/10/<lot>][/21/<serial>]
// opens the product page with that GTIN through its code on the domain and
// records a scan like the short link; a wrong check digit is refused, other
// domains' pages and the shared host never resolve. Runs the real pipeline
// against in-memory tables, as content/docs/product-pages.mdx describes.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  afterQueue: [] as (() => unknown)[],
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
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1,
      remaining: 1,
      reset: 0,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/lib/events/emit", () => ({ emitScanRecorded: async () => {} }));

const route = await import("@/app/gs1/[...path]/route");
const { LOCATION_COOKIE } = await import("@/lib/scan-location/server");

const GTIN = "09506000134352";
const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u_brand",
    organizationId: "org_brand",
    slug: `slug-${id}`,
    slugScope: "",
    kind: "page",
    pageId: "page_honey",
    destinationUrl: "https://qrdx.dev/p/x",
    domainId: "dom_brand",
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
    title: "Honey",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
  state.afterQueue = [];
  fakeDb.seed("landingPage", [
    { id: "page_honey", type: "product", gtin: GTIN, title: "Honey" },
    { id: "page_other", type: "product", gtin: null, title: "Jam" },
  ]);
  fakeDb.seed("qrCode", [code("code_honey")]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function scan(
  path: string,
  { host = "go.brand.com", domainId = "dom_brand" as string | null } = {},
) {
  const segments = path.split("/").filter(Boolean);
  const request = new NextRequest(new URL(path, `https://${host}`), {
    headers: {
      host,
      "user-agent": PHONE,
      "x-real-ip": "203.0.113.9",
      ...(domainId ? { "x-qrdx-custom-domain": domainId } : {}),
    },
  });
  const response = await route.GET(request, {
    params: Promise.resolve({ path: segments }),
  });
  for (const task of state.afterQueue.splice(0)) await task();
  return response;
}

const scans = () => fakeDb.rows("qrScan");

describe("a GS1 Digital Link on a custom domain", () => {
  it("opens the product page and counts a scan", async () => {
    const response = await scan(`/01/${GTIN}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/p/slug-code_honey");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(scans()).toHaveLength(1);
    expect(scans()[0]).toMatchObject({ qrCodeId: "code_honey" });
    expect(fakeDb.find("qrCode", { id: "code_honey" })?.scanCount).toBe(1);
  });

  it("takes GTIN-13 and batch or serial qualifiers", async () => {
    const response = await scan(`/01/${GTIN.slice(1)}/10/LOT42/21/0007`);
    expect(response.headers.get("location")).toBe("/p/slug-code_honey");
  });

  it("refuses a wrong check digit", async () => {
    const response = await scan("/01/09506000134353");
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/wrong check digit/);
    expect(scans()).toHaveLength(0);
  });

  it("refuses broken qualifiers", async () => {
    const response = await scan(`/01/${GTIN}/21/S1/10/L1`);
    expect(response.status).toBe(400);
  });

  it("finds nothing for a GTIN no page on this domain uses", async () => {
    expect((await scan("/01/04006381333931")).status).toBe(404);
  });

  it("never resolves another domain's product page", async () => {
    fakeDb.seed("customDomain", [
      { id: "dom_other", hostname: "go.other.com", verified: true },
    ]);
    const response = await scan(`/01/${GTIN}`, {
      host: "go.other.com",
      domainId: "dom_other",
    });
    expect(response.status).toBe(404);
  });

  it("never resolves on QRdx's shared host", async () => {
    // No domain tag, and a QRdx host even when the header is forged.
    expect((await scan(`/01/${GTIN}`, { domainId: null })).status).toBe(404);
    expect(
      (await scan(`/01/${GTIN}`, { host: "qrdx.dev", domainId: "dom_brand" }))
        .status,
    ).toBe(404);
  });

  it("asks for precise location like the short link when the owner turned it on", async () => {
    fakeDb.resetAll();
    fakeDb.seed("landingPage", [
      { id: "page_honey", type: "product", gtin: GTIN, title: "Honey" },
    ]);
    fakeDb.seed("qrCode", [
      code("code_honey", {
        pixels: { consent: "auto", conversions: false, preciseLocation: true },
      }),
    ]);
    // The owner's plan includes precise location (any unknown product is Pro).
    fakeDb.seed("subscription", [
      {
        id: "sub_brand",
        userId: "u_brand",
        status: "active",
        productId: "pro-monthly",
        createdAt: new Date(),
      },
    ]);
    fakeDb.seed("member", [
      {
        id: "m1",
        organizationId: "org_brand",
        userId: "u_brand",
        role: "owner",
      },
    ]);
    const response = await scan(`/01/${GTIN}`);
    expect(response.headers.get("location")).toBe("/p/slug-code_honey");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${LOCATION_COOKIE}=`));
    expect(cookie).toContain("Path=/p/slug-code_honey");
  });

  it("prefers an active code and says when the only one is off", async () => {
    fakeDb.resetAll();
    fakeDb.seed("landingPage", [
      { id: "page_honey", type: "product", gtin: GTIN, title: "Honey" },
    ]);
    fakeDb.seed("qrCode", [
      code("code_old", {
        archivedAt: new Date("2026-10-05T00:00:00Z"),
        createdAt: new Date("2026-09-01T00:00:00Z"),
      }),
      code("code_new"),
    ]);
    expect((await scan(`/01/${GTIN}`)).headers.get("location")).toBe(
      "/p/slug-code_new",
    );
    const archived = fakeDb.find("qrCode", { id: "code_new" });
    if (archived) archived.archivedAt = new Date();
    expect((await scan(`/01/${GTIN}`)).status).toBe(410);
  });
});
