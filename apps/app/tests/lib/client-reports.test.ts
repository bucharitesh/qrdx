// Client-branded shared stats pages (agency tools): a share can carry a
// client brand (a brand_kit row with purpose "client") on Pro and Business;
// Pro keeps "Made with QRdx", Business drops every QRdx mark and can serve
// the link on one of the workspace's verified custom domains, where only
// the shares assigned to that domain answer. Brands and domains of another
// workspace are refused, and so are viewers and Free. In-memory tables
// (tests/support/fake-db); nothing touches a database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plans: {} as Record<string, "free" | "pro" | "business">,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async (scope: { organizationId: string | null }) =>
    state.plans[scope.organizationId ?? ""] ?? "free",
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: false,
  putObject: async () => {},
  deleteObject: async () => {},
  publicUrl: () => null,
}));
vi.mock("@/lib/scans", () => ({
  getScanAnalytics: async (_codeId: string, days: number) => ({
    from: new Date(),
    days,
    total: 4,
    unique: 3,
    series: [{ date: "2026-11-04", count: 4 }],
    countries: [{ value: "IN", count: 4 }],
    cities: [{ city: "Pune", country: "IN", count: 4 }],
    devices: [{ value: "mobile", count: 4 }],
    os: [],
    browsers: [],
    referrers: [],
    sources: { qr: 4, nfc: 0 },
  }),
}));

const {
  enablePublicStats,
  getPublicStatsShare,
  getStatsBranding,
  loadPublicStats,
  resetPublicStats,
  setStatsBranding,
} = await import("@/lib/public-stats");
const { deleteClientBrand, listClientBrands, saveClientBrand } = await import(
  "@/lib/client-brands"
);

const owner = {
  userId: "u_ana",
  organizationId: "org_agency",
  role: "owner" as const,
};
const member = { ...owner, userId: "u_max", role: "member" as const };
const viewer = { ...owner, userId: "u_vi", role: "viewer" as const };
const other = {
  userId: "u_eve",
  organizationId: "org_other",
  role: "owner" as const,
};

const tokenOf = (url: string | null) =>
  url?.split("/stats/")[1]?.split("?")[0] ?? "";
const keep = { kind: "keep" } as const;

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("codePublicStats", "qrCodeId");
  fakeDb.unique("codePublicStats", "token");
  state.plans = { org_agency: "pro", org_other: "business" };
  fakeDb.seed("qrCode", [
    {
      id: "c_menu",
      userId: "u_ana",
      organizationId: "org_agency",
      title: "Spring menu",
      slug: "spring-menu",
      slugScope: "",
      destinationUrl: "https://cafe.example.com/menu?table=4",
      domainId: null,
      isActive: true,
      deletedAt: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ]);
  fakeDb.seed("customDomain", [
    {
      id: "d_links",
      organizationId: "org_agency",
      hostname: "links.agency.example",
      verified: true,
    },
    {
      id: "d_pending",
      organizationId: "org_agency",
      hostname: "new.agency.example",
      verified: false,
    },
    {
      id: "d_theirs",
      organizationId: "org_other",
      hostname: "go.other.example",
      verified: true,
    },
  ]);
});

async function brand(
  scope: typeof owner | typeof member | typeof viewer = owner,
  name = "Bloom Cafe",
  accent = "#1F6FEB",
) {
  return saveClientBrand(scope, null, { name, accent, logo: keep });
}

describe("client brands", () => {
  it("are part of Pro and Business, and only for people who can share", async () => {
    state.plans.org_agency = "free";
    await expect(brand()).rejects.toMatchObject({
      status: 402,
      code: "PLAN_REQUIRED",
      message: "Client branding is part of Pro.",
    });
    state.plans.org_agency = "pro";
    await expect(brand(viewer)).rejects.toMatchObject({ status: 403 });
    const saved = await brand(member);
    expect(saved).toMatchObject({ name: "Bloom Cafe", accent: "#1f6feb" });
    expect(fakeDb.find("brandKit", { id: saved.id })).toMatchObject({
      purpose: "client",
      organizationId: "org_agency",
      colors: { accent: "#1f6feb" },
    });
  });

  it("checks the name, the color and a typed logo URL", async () => {
    await expect(
      saveClientBrand(owner, null, { name: " ", accent: null, logo: keep }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      saveClientBrand(owner, null, { name: "A", accent: "blue", logo: keep }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      saveClientBrand(owner, null, {
        name: "A",
        accent: null,
        logo: { kind: "url", url: "http://192.168.1.4/logo.png" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const saved = await saveClientBrand(owner, null, {
      name: "A",
      accent: "#abc",
      logo: { kind: "url", url: "https://cdn.example.com/logo.png" },
    });
    expect(saved).toMatchObject({
      accent: "#aabbcc",
      logo: "https://cdn.example.com/logo.png",
    });
  });

  it("never lists older QR design kits or another workspace's brands", async () => {
    fakeDb.seed("brandKit", [
      {
        id: "bk_old",
        organizationId: "org_agency",
        name: "Old kit",
        purpose: null,
      },
      {
        id: "bk_x",
        organizationId: "org_other",
        name: "Theirs",
        purpose: "client",
      },
    ]);
    const mine = await brand();
    expect((await listClientBrands("org_agency")).map((b) => b.id)).toEqual([
      mine.id,
    ]);
    await expect(
      saveClientBrand(owner, "bk_x", {
        name: "Mine now",
        accent: null,
        logo: keep,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(deleteClientBrand(owner, "bk_x")).rejects.toMatchObject({
      status: 404,
    });
    expect(fakeDb.find("brandKit", { id: "bk_x" })).toMatchObject({
      name: "Theirs",
    });
  });
});

describe("branding a shared stats page", () => {
  it("needs the page on, a brand of this workspace and the right plan", async () => {
    const mine = await brand();
    await expect(
      setStatsBranding(owner, "c_menu", { brandId: mine.id, domainId: null }),
    ).rejects.toMatchObject({ status: 409 });
    await enablePublicStats(owner, "c_menu");
    await expect(
      setStatsBranding(viewer, "c_menu", { brandId: mine.id, domainId: null }),
    ).rejects.toMatchObject({ status: 403 });
    fakeDb.seed("brandKit", [
      {
        id: "bk_x",
        organizationId: "org_other",
        name: "Theirs",
        purpose: "client",
      },
    ]);
    await expect(
      setStatsBranding(owner, "c_menu", { brandId: "bk_x", domainId: null }),
    ).rejects.toMatchObject({ status: 404 });
    // A custom domain is Business only.
    await expect(
      setStatsBranding(owner, "c_menu", {
        brandId: mine.id,
        domainId: "d_links",
      }),
    ).rejects.toMatchObject({ status: 402 });
    const { branding } = await setStatsBranding(owner, "c_menu", {
      brandId: mine.id,
      domainId: null,
    });
    expect(branding).toMatchObject({
      available: true,
      allowed: true,
      whiteLabel: false,
      brandId: mine.id,
      domains: [],
    });
    // Another workspace's owner can't even see it.
    await expect(getStatsBranding(other, "c_menu")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("on Pro shows the client's brand and keeps Made with QRdx", async () => {
    const mine = await brand();
    const share = await enablePublicStats(owner, "c_menu");
    await setStatsBranding(owner, "c_menu", {
      brandId: mine.id,
      domainId: null,
    });
    const stats = await loadPublicStats(tokenOf(share.url), "30d");
    expect(stats?.brand).toEqual({
      name: "Bloom Cafe",
      logo: null,
      accent: "#1f6feb",
    });
    expect(stats?.hideQrdx).toBe(false);
    expect(stats?.hideShortLink).toBe(false);
    // Still aggregates only: no city, no destination path.
    const text = JSON.stringify(stats);
    expect(text).not.toContain("Pune");
    expect(text).not.toContain("table=4");
  });

  it("on Business drops every QRdx mark and serves the link on a verified domain", async () => {
    state.plans.org_agency = "business";
    const mine = await brand();
    await enablePublicStats(owner, "c_menu");
    // Pending domains and other workspaces' domains can't be used.
    for (const domainId of ["d_pending", "d_theirs"]) {
      await expect(
        setStatsBranding(owner, "c_menu", { brandId: mine.id, domainId }),
      ).rejects.toMatchObject({ status: 404 });
    }
    const { share, branding } = await setStatsBranding(owner, "c_menu", {
      brandId: mine.id,
      domainId: "d_links",
    });
    expect(branding.domains).toEqual([
      { id: "d_links", hostname: "links.agency.example" },
    ]);
    expect(share.url).toMatch(
      /^https:\/\/links\.agency\.example\/stats\/[A-Za-z0-9_-]{32}$/,
    );
    const token = tokenOf(share.url);
    const onQrdx = await loadPublicStats(token, "30d");
    expect(onQrdx).toMatchObject({ hideQrdx: true, hideShortLink: true });
    // On its own domain it answers; on another verified domain it doesn't.
    expect(
      await loadPublicStats(token, "30d", { customDomainId: "d_links" }),
    ).not.toBeNull();
    expect(
      await loadPublicStats(token, "30d", { customDomainId: "d_theirs" }),
    ).toBeNull();
    // A reset keeps the brand and the domain.
    const reset = await resetPublicStats(owner, "c_menu");
    expect(reset.url).toMatch(/^https:\/\/links\.agency\.example\/stats\//);
    expect(
      (await loadPublicStats(tokenOf(reset.url), "30d"))?.brand?.name,
    ).toBe("Bloom Cafe");
  });

  it("goes back to plain, on QRdx's host, after a downgrade", async () => {
    state.plans.org_agency = "business";
    const mine = await brand();
    await enablePublicStats(owner, "c_menu");
    await setStatsBranding(owner, "c_menu", {
      brandId: mine.id,
      domainId: "d_links",
    });
    state.plans.org_agency = "pro";
    const share = await getPublicStatsShare(owner, "c_menu");
    expect(share.url).toMatch(/^http:\/\/localhost:3000\/stats\//);
    const token = tokenOf(share.url);
    expect(await loadPublicStats(token, "30d")).toMatchObject({
      brand: { name: "Bloom Cafe" },
      hideQrdx: false,
    });
    // Business-only: the custom domain stops serving it.
    expect(
      await loadPublicStats(token, "30d", { customDomainId: "d_links" }),
    ).toBeNull();
    state.plans.org_agency = "free";
    expect(await loadPublicStats(token, "30d")).toMatchObject({
      brand: null,
      hideQrdx: false,
    });
  });

  it("never serves an unassigned share on a custom domain", async () => {
    state.plans.org_agency = "business";
    const share = await enablePublicStats(owner, "c_menu");
    expect(
      await loadPublicStats(tokenOf(share.url), "30d", {
        customDomainId: "d_links",
      }),
    ).toBeNull();
    expect(await loadPublicStats(tokenOf(share.url), "30d")).not.toBeNull();
  });
});

describe("plan gates", () => {
  it("puts client branding on Pro and Business, the rest on Business", async () => {
    const { plansWith } = await import("@/lib/plans");
    expect(plansWith((l) => l.clientReports)).toEqual(["pro", "business"]);
    expect(plansWith((l) => l.clientReportsWhiteLabel)).toEqual(["business"]);
    expect(plansWith((l) => l.clientPortal)).toEqual(["business"]);
    expect(plansWith((l) => l.invoiceBilling)).toEqual(["business"]);
  });
});
