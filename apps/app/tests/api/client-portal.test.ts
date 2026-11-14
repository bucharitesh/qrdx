// The client portal (agency tools, Business): a workspace invites a client
// by email and shares some folders; the client signs in and sees exactly
// those folders' codes, read-only, at /portal/<workspace>. These tests hold
// the line the feature depends on:
// - a client sees only shared folders of that workspace (not other folders,
//   not folder-less codes, not the trash, not another workspace's folder
//   even if a row points at it), and loses access when removed, when the
//   folder is unshared or when the plan drops Business;
// - an invitation is claimed only by a verified email, and once claimed
//   only by that account;
// - clients are never workspace members, so every dashboard write action,
//   the portal's own management actions and the REST API refuse them, by
//   URL (/dashboard/<slug>) and by id, and nothing is written;
// - managing clients needs owners or admins on Business, and only this
//   workspace's folders.
// The real lib/scope, lib/plans and actions run against in-memory tables
// (tests/support/fake-db); Better Auth's session and email are faked.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_monthly";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    session: null as null | { userId: string; organizationId: string | null },
    headers: new Headers(),
    emails: [] as { to: string | string[]; subject: string }[],
  };
});

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
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => state.headers),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
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
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  return {
    auth: {
      api: {
        getSession: async () =>
          state.session
            ? {
                user: {
                  ...db.find("user", { id: state.session.userId }),
                  id: state.session.userId,
                },
                session: {
                  activeOrganizationId: state.session.organizationId,
                },
              }
            : null,
      },
    },
  };
});
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: async (message: { to: string | string[]; subject: string }) => {
    state.emails.push({ to: message.to, subject: message.subject });
    return { sent: true, id: "email_1" };
  },
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: false,
  putObject: async () => {},
  deleteObject: async () => {},
  headObject: async () => null,
  copyObject: async () => {},
  presignUpload: async () => ({ url: "https://r2.invalid/up", headers: {} }),
  presignDownload: async () => "https://r2.invalid/down",
  publicUrl: () => null,
  StorageNotConfiguredError: class extends Error {},
  ObjectChangedError: class extends Error {},
}));
vi.mock("@/lib/scans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scans")>()),
  getScanAnalytics: async (_id: string, days: number) => ({
    from: new Date(),
    days,
    total: 2,
    unique: 2,
    series: [],
    countries: [],
    cities: [{ city: "Lyon", country: "FR", count: 2 }],
    devices: [],
    os: [],
    browsers: [],
    referrers: [],
    sources: { qr: 2, nfc: 0 },
  }),
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
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
  emitCodeDeleted: () => {},
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));

const access = await import("@/lib/portal/access");
const portal = await import("@/actions/portal");
const qrCodes = await import("@/actions/qr-codes");
const folders = await import("@/actions/folders");
const publicStats = await import("@/actions/public-stats");
const clientBrands = await import("@/actions/client-brands");
const v1List = await import("@/app/api/v1/codes/route");
const v1One = await import("@/app/api/v1/codes/[id]/route");

const NOW = new Date("2026-11-11T12:00:00Z");
const HOUR = 3_600_000;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// ─── Fixtures ───────────────────────────────────────────────────────────────

function code(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    userId: "u_ana",
    organizationId: "org_agency",
    slug: id.replace("c_", "S"),
    slugScope: "",
    destinationUrl: `https://example.com/${id}?secret=1`,
    title: id,
    contentType: "url",
    style: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 3,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(NOW.getTime() - 1000),
    updatedAt: new Date(NOW.getTime() - 1000),
    ...overrides,
  };
}

function signIn(userId: string | null, workspaceSlug?: string) {
  state.session = userId ? { userId, organizationId: null } : null;
  state.headers = new Headers(
    workspaceSlug ? { "x-qrdx-workspace": workspaceSlug } : {},
  );
}

const asClient = async () => {
  signIn("u_cli");
  const found = await access.findPortal("agency");
  if (!found) throw new Error("portal missing");
  return { portal: found, viewer: await access.portalViewer(found) };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.emails = [];
  fakeDb.unique("portalClient", "organizationId", "email");
  fakeDb.unique("portalClientFolder", "clientId", "folderId");
  fakeDb.seed("organization", [
    { id: "org_agency", name: "North Agency", slug: "agency", logo: null },
    { id: "org_other", name: "Other Co", slug: "other", logo: null },
  ]);
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana",
      email: "ana@agency.example",
      emailVerified: true,
    },
    {
      id: "u_max",
      name: "Max",
      email: "max@agency.example",
      emailVerified: true,
    },
    {
      id: "u_cli",
      name: "Cleo",
      email: "Cleo@Client.example",
      emailVerified: true,
    },
    {
      id: "u_late",
      name: "Late",
      email: "late@client.example",
      emailVerified: false,
    },
    {
      id: "u_otto",
      name: "Otto",
      email: "otto@other.example",
      emailVerified: true,
    },
  ]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_agency", userId: "u_ana", role: "owner" },
    { id: "m2", organizationId: "org_agency", userId: "u_max", role: "member" },
    { id: "m3", organizationId: "org_other", userId: "u_otto", role: "owner" },
  ]);
  fakeDb.seed("subscription", [
    {
      id: "sub_ana",
      userId: "u_ana",
      productId: "prod_business_monthly",
      status: "active",
      createdAt: NOW,
    },
  ]);
  fakeDb.seed("folder", [
    {
      id: "f_bloom",
      organizationId: "org_agency",
      userId: "u_ana",
      name: "Bloom",
      parentId: null,
      position: 0,
    },
    {
      id: "f_spring",
      organizationId: "org_agency",
      userId: "u_ana",
      name: "Bloom / Spring",
      parentId: "f_bloom",
      position: 0,
    },
    {
      id: "f_rival",
      organizationId: "org_agency",
      userId: "u_ana",
      name: "Rival client",
      parentId: null,
      position: 1,
    },
    {
      id: "f_theirs",
      organizationId: "org_other",
      userId: "u_otto",
      name: "Other's folder",
      parentId: null,
      position: 0,
    },
  ]);
  fakeDb.seed("qrCode", [
    code("c_menu", { folderId: "f_bloom", title: "Menu" }),
    code("c_page", { folderId: "f_bloom", kind: "page", title: "Event page" }),
    code("c_trashed", { folderId: "f_bloom", deletedAt: NOW }),
    code("c_disabled", { folderId: "f_bloom", isActive: false }),
    code("c_spring", { folderId: "f_spring" }),
    code("c_rival", { folderId: "f_rival", title: "Rival menu" }),
    code("c_loose", { folderId: null }),
    code("c_theirs", {
      folderId: "f_theirs",
      organizationId: "org_other",
      userId: "u_otto",
    }),
  ]);
  fakeDb.seed("portalClient", [
    {
      id: "pc_cleo",
      organizationId: "org_agency",
      email: "cleo@client.example",
      name: "Bloom Cafe",
      userId: null,
      invitedBy: "u_ana",
      createdAt: NOW,
      acceptedAt: null,
      lastSeenAt: null,
    },
    {
      id: "pc_late",
      organizationId: "org_agency",
      email: "late@client.example",
      name: null,
      userId: null,
      invitedBy: "u_ana",
      createdAt: NOW,
      acceptedAt: null,
      lastSeenAt: null,
    },
  ]);
  fakeDb.seed("portalClientFolder", [
    { clientId: "pc_cleo", folderId: "f_bloom" },
    // A row pointing at another workspace's folder (never shown).
    { clientId: "pc_cleo", folderId: "f_theirs" },
    { clientId: "pc_late", folderId: "f_bloom" },
  ]);
  signIn(null);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── What a client sees ─────────────────────────────────────────────────────

describe("who the portal lets in", () => {
  it("exists only for a workspace on Business", async () => {
    expect(await access.findPortal("agency")).toMatchObject({
      id: "org_agency",
      brand: { name: "North Agency" },
    });
    expect(await access.findPortal("other")).toBeNull();
    expect(await access.findPortal("nope")).toBeNull();
    expect(await access.findPortal("../agency")).toBeNull();
  });

  it("asks signed-out visitors to sign in, and tells others they aren't invited", async () => {
    const found = await access.findPortal("agency");
    if (!found) throw new Error("portal missing");
    signIn(null);
    expect(await access.portalViewer(found)).toEqual({ kind: "signed-out" });
    signIn("u_otto");
    expect(await access.portalViewer(found)).toEqual({
      kind: "no-access",
      email: "otto@other.example",
    });
    // A workspace member isn't a client either.
    signIn("u_max");
    expect((await access.portalViewer(found)).kind).toBe("no-access");
  });

  it("is claimed by a verified email, then only by that account", async () => {
    const { viewer } = await asClient();
    expect(viewer).toMatchObject({
      kind: "client",
      clientId: "pc_cleo",
      folderIds: ["f_bloom"],
    });
    expect(fakeDb.find("portalClient", { id: "pc_cleo" })).toMatchObject({
      userId: "u_cli",
      acceptedAt: NOW,
    });
    // Someone else who later has that address doesn't get in.
    const found = await access.findPortal("agency");
    if (!found) throw new Error("portal missing");
    fakeDb.seed("user", [
      { id: "u_new", email: "cleo@client.example", emailVerified: true },
    ]);
    signIn("u_new");
    expect((await access.portalViewer(found)).kind).toBe("no-access");
    // An unverified address can't claim its invitation.
    signIn("u_late");
    expect((await access.portalViewer(found)).kind).toBe("no-access");
    expect(fakeDb.find("portalClient", { id: "pc_late" })?.userId).toBeNull();
  });
});

describe("what a client sees", () => {
  it("lists only the shared folder's live codes, with destination hosts only", async () => {
    const { portal: found, viewer } = await asClient();
    if (viewer.kind !== "client") throw new Error("not a client");
    const shared = await access.listPortalFolders(found, viewer);
    expect(shared.map((f) => f.id)).toEqual(["f_bloom"]);
    const ids = shared.flatMap((f) => f.codes.map((c) => c.id)).sort();
    expect(ids).toEqual(["c_menu", "c_page"]);
    const text = JSON.stringify(shared);
    expect(text).not.toContain("secret=1");
    expect(text).not.toContain("Rival");
    expect(shared[0]?.codes.find((c) => c.id === "c_page")?.pageUrl).toMatch(
      /\/p\/Spage$/,
    );
  });

  it("answers 'not found' for any code outside the shared folders, by id", async () => {
    const { portal: found, viewer } = await asClient();
    if (viewer.kind !== "client") throw new Error("not a client");
    expect(await access.findPortalCode(found, viewer, "c_menu")).toMatchObject({
      id: "c_menu",
      folderName: "Bloom",
    });
    for (const id of [
      "c_rival",
      "c_spring",
      "c_loose",
      "c_trashed",
      "c_disabled",
      "c_theirs",
      "../c_menu",
    ]) {
      expect(await access.findPortalCode(found, viewer, id), id).toBeNull();
    }
    const code = await access.findPortalCode(found, viewer, "c_menu");
    if (!code) throw new Error("no code");
    const report = await access.portalCodeAnalytics(found, code, "30d");
    expect(JSON.stringify(report)).not.toContain("Lyon");
    // Business keeps the whole history: All time, from the code's creation
    // while it has no scans.
    const all = await access.portalCodeAnalytics(found, code, "all");
    expect(all.ranges).toEqual(["7d", "30d", "90d", "all"]);
    expect(all.range).toBe("all");
    expect(all.analytics.days).toBeGreaterThanOrEqual(1);
  });

  it("loses access when unshared, removed or the plan drops Business", async () => {
    signIn("u_ana", "agency");
    const updated = await portal.updatePortalClientAction({
      id: "pc_cleo",
      name: "Bloom Cafe",
      folderIds: ["f_rival"],
    });
    expect(updated.ok).toBe(true);
    let { portal: found, viewer } = await asClient();
    if (viewer.kind !== "client") throw new Error("not a client");
    expect(await access.findPortalCode(found, viewer, "c_menu")).toBeNull();
    expect(
      await access.findPortalCode(found, viewer, "c_rival"),
    ).not.toBeNull();

    signIn("u_ana", "agency");
    expect((await portal.removePortalClientAction({ id: "pc_cleo" })).ok).toBe(
      true,
    );
    ({ portal: found, viewer } = await asClient());
    expect(viewer.kind).toBe("no-access");

    (
      fakeDb.find("subscription", { id: "sub_ana" }) as { status: string }
    ).status = "canceled";
    expect(await access.findPortal("agency")).toBeNull();
  });
});

// ─── Clients can't act in the workspace ─────────────────────────────────────

describe("a client in the dashboard's actions", () => {
  const snapshotRows = () =>
    JSON.stringify({
      codes: fakeDb.rows("qrCode"),
      folders: fakeDb.rows("folder"),
      shares: fakeDb.rows("codePublicStats"),
      brands: fakeDb.rows("brandKit"),
      clients: fakeDb.rows("portalClient"),
      links: fakeDb.rows("portalClientFolder"),
    });

  it("refuses every read and write by the workspace's URL", async () => {
    await asClient(); // claim the invitation first
    signIn("u_cli", "agency");
    const snapshot = snapshotRows();
    const results = await Promise.all([
      qrCodes.getQrCode("c_menu"),
      qrCodes.listQrCodes(),
      qrCodes.updateQrCode({ id: "c_menu", title: "Hijacked" }),
      qrCodes.setQrCodeArchived({ id: "c_menu", archived: true }),
      qrCodes.deleteQrCode({ id: "c_menu" }),
      folders.listCodeFolders(),
      folders.renameCodeFolder({ id: "f_bloom", name: "Mine" }),
      folders.deleteCodeFolder({ id: "f_bloom" }),
      publicStats.getPublicStatsShareAction({ codeId: "c_menu" }),
      publicStats.setPublicStatsShareAction({ codeId: "c_menu", on: true }),
      publicStats.setStatsBrandingAction({
        codeId: "c_menu",
        brandId: null,
        domainId: null,
      }),
    ]);
    for (const [index, result] of results.entries()) {
      expect((result as { success: boolean }).success, `action ${index}`).toBe(
        false,
      );
    }
    const form = new FormData();
    form.set("name", "Hijack Inc");
    const more = await Promise.all([
      clientBrands.saveClientBrandAction(form),
      portal.savePortalBrandAction(form),
      portal.invitePortalClientAction({
        email: "friend@client.example",
        name: "",
        folderIds: ["f_rival"],
      }),
      portal.updatePortalClientAction({
        id: "pc_cleo",
        name: null,
        folderIds: ["f_bloom", "f_rival"],
      }),
      portal.removePortalClientAction({ id: "pc_late" }),
    ]);
    for (const [index, result] of more.entries()) {
      expect(result.ok, `portal action ${index}`).toBe(false);
    }
    expect(snapshotRows()).toBe(snapshot);
    expect(state.emails).toEqual([]);

    // The workspace in the URL is a 404 for them, as for any outsider.
    const { getActiveScope, WorkspaceNotFoundError } = await import(
      "@/lib/scope"
    );
    await expect(getActiveScope()).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    );
    // Control: the same calls do work for the workspace's owner.
    signIn("u_ana", "agency");
    expect(
      await qrCodes.updateQrCode({ id: "c_menu", title: "Renamed" }),
    ).toMatchObject({ success: true });
    expect((await folders.listCodeFolders()).success).toBe(true);
  });

  it("acts only in the client's own workspace by id", async () => {
    signIn("u_cli");
    expect((await qrCodes.getQrCode("c_menu")).success).toBe(false);
    const updated = await qrCodes.updateQrCode({ id: "c_menu", title: "X" });
    expect(updated).toMatchObject({
      success: false,
      error: { code: "NOT_FOUND" },
    });
    const listed = await qrCodes.listQrCodes();
    expect(listed.success && listed.data.codes).toEqual([]);
    expect(fakeDb.find("qrCode", { id: "c_menu" })?.title).toBe("Menu");
  });
});

describe("a client through the REST API", () => {
  const token = "client-token";
  const call = (method: string, path: string, body?: unknown) =>
    new NextRequest(new URL(path, "http://localhost:3000"), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
    fakeDb.seed("oauthToken", [
      {
        id: "tok_client",
        accessTokenHash: sha256(token),
        refreshTokenHash: sha256(`${token}-refresh`),
        appId: "app_1",
        userId: "u_cli",
        scopes: ["codes:read", "codes:write"],
        accessTokenExpiresAt: new Date(NOW.getTime() + HOUR),
        refreshTokenExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
        revokedAt: null,
      },
    ]);
    (fakeDb.find("user", { id: "u_cli" }) as Record<string, unknown>).banned =
      false;
  });

  it("can't list, read, change or delete the agency's codes", async () => {
    await asClient();
    const listed = await v1List.GET(call("GET", "/api/v1/codes"));
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { data: { id: string }[] };
    expect(body.data).toEqual([]);
    for (const id of ["c_menu", "c_page", "c_rival"]) {
      expect(
        (await v1One.GET(call("GET", `/api/v1/codes/${id}`), ctx(id))).status,
      ).toBe(404);
      expect(
        (
          await v1One.PATCH(
            call("PATCH", `/api/v1/codes/${id}`, { title: "Hijacked" }),
            ctx(id),
          )
        ).status,
      ).toBe(404);
      expect(
        (await v1One.DELETE(call("DELETE", `/api/v1/codes/${id}`), ctx(id)))
          .status,
      ).toBe(404);
    }
    expect(fakeDb.find("qrCode", { id: "c_menu" })).toMatchObject({
      title: "Menu",
      deletedAt: null,
    });
    // Control: the token does reach the client's own workspace.
    const { ownWorkspaceId } = await import("@repo/auth/own-workspace-id");
    fakeDb.seed("qrCode", [
      code("c_own", {
        userId: "u_cli",
        organizationId: ownWorkspaceId("u_cli"),
      }),
    ]);
    expect(
      (await v1One.GET(call("GET", "/api/v1/codes/c_own"), ctx("c_own")))
        .status,
    ).toBe(200);
  });
});

// ─── Managing clients ───────────────────────────────────────────────────────

describe("managing portal clients", () => {
  it("needs an owner or admin, on Business, and this workspace's folders", async () => {
    signIn("u_max", "agency");
    expect(
      await portal.invitePortalClientAction({
        email: "new@client.example",
        name: "",
        folderIds: ["f_bloom"],
      }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });

    signIn("u_ana", "agency");
    expect(
      await portal.invitePortalClientAction({
        email: "new@client.example",
        name: "",
        folderIds: ["f_theirs"],
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await portal.invitePortalClientAction({
        email: "new@client.example",
        name: "",
        folderIds: [],
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });

    const invited = await portal.invitePortalClientAction({
      email: " New@Client.example ",
      name: "New client",
      folderIds: ["f_rival", "f_rival"],
    });
    expect(invited).toMatchObject({
      ok: true,
      data: {
        emailed: true,
        client: { email: "new@client.example", folderIds: ["f_rival"] },
      },
    });
    expect(state.emails).toEqual([
      {
        to: "new@client.example",
        subject: "North Agency shared QR code reports with you",
      },
    ]);
    // Inviting the same address again changes it instead of adding one.
    await portal.invitePortalClientAction({
      email: "new@client.example",
      name: "New client",
      folderIds: ["f_bloom"],
    });
    expect(
      fakeDb
        .rows("portalClient")
        .filter((row) => row.email === "new@client.example"),
    ).toHaveLength(1);

    // Another workspace's owner can't touch these clients.
    signIn("u_otto", "other");
    expect(
      await portal.removePortalClientAction({ id: "pc_cleo" }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(fakeDb.find("portalClient", { id: "pc_cleo" })).toBeTruthy();
  });

  it("is refused on Pro, while removing a client still works", async () => {
    fakeDb.seed("subscription", [
      {
        id: "sub_ana_pro",
        userId: "u_ana",
        productId: "prod_pro_monthly",
        status: "active",
        createdAt: new Date(NOW.getTime() + 1),
      },
    ]);
    (
      fakeDb.find("subscription", { id: "sub_ana" }) as { status: string }
    ).status = "canceled";
    signIn("u_ana", "agency");
    expect(
      await portal.invitePortalClientAction({
        email: "new@client.example",
        name: "",
        folderIds: ["f_bloom"],
      }),
    ).toMatchObject({
      ok: false,
      code: "PLAN_REQUIRED",
      error: "The client portal is part of Business.",
    });
    expect((await portal.removePortalClientAction({ id: "pc_late" })).ok).toBe(
      true,
    );
  });
});
