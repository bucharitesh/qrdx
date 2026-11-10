// Changing what a printed code opens (app/dashboard/codes/_lib/code-kind.ts),
// as content/docs/help/dynamic-codes/change-the-type.mdx describes it: a
// website link becomes a hosted page and back with the same short link and
// scans; the page it leaves stays in Pages and can be brought back; a new
// page counts toward the plan's hosted pages; settings of the other type are
// kept; version history restores across types. Runs the REST API route, the
// /q/<slug> pipeline and the hosted page loader against in-memory tables.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "business" as "free" | "pro" | "business",
  headers: new Headers(),
  tasks: [] as Promise<unknown>[],
  updated: [] as { id: string; fields: string[] }[],
  limitNotes: [] as { meter: string; used: number }[],
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
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(Promise.resolve().then(task));
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 42_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
  getOwnerPlanForOrganization: async () => state.plan,
}));
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: (_scope: unknown, code: { id: string }, fields: string[]) =>
    state.updated.push({ id: code.id, fields }),
  emitScanRecorded: async () => {},
}));
vi.mock("@/lib/limit-notices", () => ({
  noteLimitUsage: (_scope: unknown, meter: string, usage: { used: number }) =>
    state.limitNotes.push({ meter, used: usage.used }),
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));

const one = await import("@/app/api/v1/codes/[id]/route");
const shortLink = await import("@/app/q/[slug]/route");
const { loadPublicPage } = await import("@/app/p/_lib/public-page");
const { rememberedPages, switchCodeKind } = await import(
  "@/app/dashboard/codes/_lib/code-kind"
);
const { deletePage, listPages } = await import(
  "@/app/dashboard/pages/_lib/landing-pages"
);
const { listCodeVersions, restoreCodeVersion } = await import(
  "@/lib/code-versions"
);
const { SHORT_LINK_BASE } = await import("@/lib/short-links");
const { PAGE_SETTINGS_TYPE } = await import(
  "@/components/landing/page-settings-block"
);
const shared = await import("@/app/dashboard/codes/_lib/code-kind-shared");

const ORG = "org_acme";
const NOW = new Date("2026-11-11T12:00:00Z");
const KEY = `qrdx_${"Kx".repeat(20)}`;
const SCOPE = { userId: "u_ana", organizationId: ORG, role: "owner" as const };
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function flush() {
  while (state.tasks.length > 0) await Promise.all(state.tasks.splice(0));
}

function api(method: string, path: string, body?: unknown) {
  const headers = {
    authorization: `Bearer ${KEY}`,
    "content-type": "application/json",
    "user-agent": "curl/8.7.1",
    "x-forwarded-for": "203.0.113.9",
  };
  state.headers = new Headers(headers);
  return new NextRequest(`http://localhost:3000/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function patch(body: unknown, id = "code_1") {
  const response = await one.PATCH(api("PATCH", `/codes/${id}`, body), ctx(id));
  const json = (await response.json()) as {
    data: Record<string, unknown>;
    code?: string;
    message?: string;
  };
  // Errors are { code, message, ... } (lib/error-response).
  return {
    status: response.status,
    data: json.data,
    error: json.code ? { code: json.code, message: json.message ?? "" } : null,
    body: json,
  };
}

/** A scan of the short link, as a phone makes it. */
async function scan(slug = "Menu123") {
  const response = await shortLink.GET(
    new NextRequest(new URL(`/q/${slug}`, "http://localhost:3000"), {
      headers: { "user-agent": PHONE, "x-real-ip": "198.51.100.7" },
    }),
    { params: Promise.resolve({ slug }) },
  );
  await flush();
  return response;
}

const code = () => fakeDb.rows("qrCode").find((row) => row.id === "code_1");
const pages = () => fakeDb.rows("landingPage");

function seedPage(id: string, overrides: Record<string, unknown> = {}) {
  fakeDb.seed("landingPage", [
    {
      id,
      userId: "u_ana",
      organizationId: ORG,
      type: "links",
      title: `Page ${id}`,
      content: { version: 1, theme: {}, blocks: [] },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.plan = "business";
  state.tasks = [];
  state.updated = [];
  state.limitNotes = [];
  state.headers = new Headers();
  fakeDb.seed("organization", [
    { id: ORG, name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana Diaz",
      email: "ana@acme.test",
      image: null,
      banned: false,
      banExpires: null,
    },
  ]);
  fakeDb.seed("member", [
    { id: "m_ana", organizationId: ORG, userId: "u_ana", role: "owner" },
  ]);
  fakeDb.seed("apiKey", [
    {
      id: "key_kx",
      name: "Kiosk",
      keyHash: sha256(KEY),
      start: KEY.slice(0, 11),
      userId: "u_ana",
      organizationId: ORG,
      scopes: ["codes:read", "codes:write"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: "u_ana",
      organizationId: ORG,
      slug: "Menu123",
      slugScope: "",
      kind: "redirect",
      pageId: null,
      destinationUrl: "https://cafe.example/menu",
      contentType: "url",
      title: "Table card",
      style: { fgColor: "#111111" },
      domainId: null,
      folderId: "folder_1",
      notes: "Printed on 400 table cards",
      isFavorite: true,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      scanCount: 5,
      lastScannedAt: null,
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      pausedAt: null,
      fallbackUrl: null,
      routing: {
        rules: [
          {
            id: "r1",
            enabled: true,
            conditions: [{ type: "device", devices: ["desktop"] }],
            action: { type: "redirect", url: "https://cafe.example/desktop" },
          },
        ],
      },
      utm: { source: "qr", medium: "print" },
      pixels: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ]);
});

afterEach(async () => {
  await flush();
  vi.useRealTimers();
});

describe("website link → hosted page", () => {
  it("makes a page from a template and keeps the link, scans and settings", async () => {
    const result = await patch({
      kind: "page",
      page: { type: "links", title: "Our links" },
    });
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      id: "code_1",
      slug: "Menu123",
      kind: "page",
      scanCount: 5,
      destinationUrl: `${SHORT_LINK_BASE}/p/Menu123`,
    });
    const pageId = result.data.pageId as string;
    expect(pageId).toBeTruthy();

    const [page] = pages();
    expect(page).toMatchObject({
      id: pageId,
      type: "links",
      title: "Our links",
      organizationId: ORG,
    });
    expect(
      (page?.content as { blocks: unknown[] } | undefined)?.blocks.length,
    ).toBeGreaterThan(0);
    expect(fakeDb.rows("landingPageVersion")).toHaveLength(1);

    // Same row: folder, notes, design and the redirect-only settings stay.
    expect(code()).toMatchObject({
      folderId: "folder_1",
      notes: "Printed on 400 table cards",
      isFavorite: true,
      style: { fgColor: "#111111" },
      utm: { source: "qr", medium: "print" },
    });
    expect(
      (code()?.routing as { rules: unknown[] } | undefined)?.rules,
    ).toHaveLength(1);

    // History holds the website link; webhooks name the changed fields.
    const [version] = fakeDb.rows("qrCodeVersion");
    expect(version?.snapshot).toMatchObject({
      kind: "redirect",
      destinationUrl: "https://cafe.example/menu",
    });
    expect(state.updated).toEqual([
      { id: "code_1", fields: ["kind", "pageId", "destinationUrl"] },
    ]);

    await flush();
    const audit = fakeDb.rows("workspaceAuditLog");
    expect(audit.map((row) => row.action)).toEqual([
      "page.created",
      "code.type_changed",
    ]);
    expect(audit[1]?.metadata).toMatchObject({
      before: {
        type: "Website link",
        destinationUrl: "https://cafe.example/menu",
        page: null,
      },
      after: { type: "Hosted page", destinationUrl: null, page: "Our links" },
    });
  });

  it("serves the page on the next scan and counts the scan on the same code", async () => {
    const before = await scan();
    expect(before.status).toBe(302);
    expect(before.headers.get("location")).toContain("https://cafe.example/");

    const { data } = await patch({ kind: "page", page: { type: "links" } });
    const after = await scan();
    expect(after.status).toBe(302);
    expect(after.headers.get("location")).toBe("/p/Menu123");
    expect(code()?.scanCount).toBe(7);
    expect(
      fakeDb.rows("qrScan").every((row) => row.qrCodeId === "code_1"),
    ).toBe(true);

    const served = await loadPublicPage({ slug: "Menu123" }, null);
    expect(served?.page.id).toBe(data.pageId);
    // The page is named after the code when no title is given.
    expect(served?.page.title).toBe("Table card");
  });

  it("counts a new page toward the plan's hosted pages", async () => {
    state.plan = "free";
    seedPage("p1");
    seedPage("p2");
    const ok = await patch({ kind: "page", page: { type: "links" } });
    expect(ok.status).toBe(200);
    expect(state.limitNotes).toEqual([{ meter: "landingPages", used: 3 }]);

    // A second code at the cap: refused, nothing changes or is left behind.
    fakeDb.seed("qrCode", [
      {
        ...(code() as Record<string, unknown>),
        id: "code_2",
        slug: "Other12",
        kind: "redirect",
        pageId: null,
        destinationUrl: "https://cafe.example/other",
      },
    ]);
    const refused = await patch(
      { kind: "page", page: { type: "links" } },
      "code_2",
    );
    expect(refused.status).toBe(402);
    expect(refused.error?.code).toBe("LIMIT_REACHED");
    expect(refused.error?.message).toContain("3 hosted pages");
    expect(pages()).toHaveLength(3);
    expect(
      fakeDb.rows("qrCode").find((row) => row.id === "code_2"),
    ).toMatchObject({ kind: "redirect", pageId: null });

    // An existing page adds nothing to the count, so it works at the cap.
    const reuse = await patch({ kind: "page", pageId: "p1" }, "code_2");
    expect(reuse.status).toBe(200);
    expect(reuse.data).toMatchObject({ kind: "page", pageId: "p1" });
    expect(pages()).toHaveLength(3);
  });

  it("takes page content as the editor publishes it, with its plan gates", async () => {
    const content = {
      version: 1,
      theme: {
        colors: {
          background: "#ffffff",
          foreground: "#111111",
          primary: "#111111",
          primaryForeground: "#ffffff",
          muted: "#f5f5f5",
          mutedForeground: "#666666",
        },
      },
      blocks: [
        {
          id: "b1",
          type: "header",
          props: { title: "Café Luna" },
        },
        {
          id: "s1",
          type: PAGE_SETTINGS_TYPE,
          props: { customCss: ".x { color: red; }" },
        },
      ],
    };
    state.plan = "pro";
    const gated = await patch({
      kind: "page",
      page: { type: "business", content },
    });
    expect(gated.status).toBe(402);
    expect(gated.error?.code).toBe("PLAN_REQUIRED");
    expect(pages()).toHaveLength(0);

    state.plan = "business";
    const saved = await patch({
      kind: "page",
      page: { type: "business", content },
    });
    expect(saved.status).toBe(200);
    const [page] = pages();
    const blocks = (
      page?.content as { blocks: { props: unknown }[] } | undefined
    )?.blocks;
    expect(blocks?.[0]?.props).toMatchObject({ title: "Café Luna" });
  });

  it("refuses pages of another workspace", async () => {
    seedPage("p_other", { organizationId: "org_other", userId: "u_bob" });
    const result = await patch({ kind: "page", pageId: "p_other" });
    expect(result.status).toBe(404);
    expect(code()).toMatchObject({ kind: "redirect", pageId: null });
  });
});

describe("hosted page → website link", () => {
  it("keeps the page to switch back to, and stops serving it", async () => {
    const { data } = await patch({
      kind: "page",
      page: { type: "links", title: "Our links" },
    });
    const pageId = data.pageId as string;

    const back = await patch({
      kind: "redirect",
      destinationUrl: "https://cafe.example/winter",
    });
    expect(back.status).toBe(200);
    expect(back.data).toMatchObject({
      kind: "redirect",
      pageId: null,
      destinationUrl: "https://cafe.example/winter",
    });
    // Redirect-only settings work again: UTM tags are back on the link.
    const response = await scan();
    expect(response.headers.get("location")).toBe(
      "https://cafe.example/winter?utm_source=qr&utm_medium=print",
    );
    expect(await loadPublicPage({ slug: "Menu123" }, null)).toBeNull();

    // The page stays in Pages, with no code, and is offered to switch back.
    const [listed] = await listPages(SCOPE);
    expect(listed).toMatchObject({ id: pageId, codes: [] });
    const remembered = await rememberedPages(SCOPE, {
      id: "code_1",
      pageId: null,
    });
    expect(remembered.map((page) => page.id)).toEqual([pageId]);

    const again = await patch({ kind: "page", pageId });
    expect(again.data).toMatchObject({ kind: "page", pageId });
    expect(pages()).toHaveLength(1);
    expect((await scan()).headers.get("location")).toBe("/p/Menu123");
  });

  it("deleting the page it left never deletes the code", async () => {
    const { data } = await patch({ kind: "page", page: { type: "links" } });
    await patch({ kind: "redirect", destinationUrl: "https://cafe.example/b" });
    const result = await deletePage(SCOPE, data.pageId as string);
    expect(result.deletedCodes).toBe(0);
    expect(code()).toMatchObject({ kind: "redirect" });
    expect(
      await rememberedPages(SCOPE, { id: "code_1", pageId: null }),
    ).toEqual([]);
  });

  it("switches to another page type with a new page and keeps the old one", async () => {
    const first = await patch({ kind: "page", page: { type: "links" } });
    const second = await patch({ kind: "page", page: { type: "business" } });
    expect(second.data.pageId).not.toBe(first.data.pageId);
    expect(
      pages()
        .map((page) => page.type)
        .sort(),
    ).toEqual(["business", "links"]);
    const remembered = await rememberedPages(SCOPE, {
      id: "code_1",
      pageId: second.data.pageId as string,
    });
    expect(remembered.map((page) => page.id)).toEqual([first.data.pageId]);
  });
});

describe("PATCH validation", () => {
  it.each([
    [{ kind: "redirect" }, "destinationUrl"],
    [
      { kind: "redirect", destinationUrl: "https://a.example", pageId: "p1" },
      "kind",
    ],
    [{ kind: "page" }, "page"],
    [{ kind: "page", pageId: "p1", page: { type: "links" } }, "page"],
    [
      { kind: "page", pageId: "p1", destinationUrl: "https://a.example" },
      "destinationUrl",
    ],
    [{ pageId: "p1" }, "pageId"],
    [{ kind: "page", page: { type: "not-a-type" } }, null],
  ])("refuses %j", async (body, path) => {
    seedPage("p1");
    const result = await patch(body);
    expect(result.status).toBe(400);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    if (path) {
      expect(JSON.stringify(result)).toContain(path);
    }
    expect(code()).toMatchObject({ kind: "redirect", pageId: null });
    expect(pages()).toHaveLength(1);
  });

  it("applies other fields with the switch", async () => {
    const result = await patch({
      kind: "page",
      page: { type: "links" },
      title: "Menu page",
    });
    expect(result.data).toMatchObject({ kind: "page", title: "Menu page" });
  });

  it("treats kind redirect on a website link as a destination edit", async () => {
    const result = await patch({
      kind: "redirect",
      destinationUrl: "https://cafe.example/new",
    });
    expect(result.data).toMatchObject({
      kind: "redirect",
      destinationUrl: "https://cafe.example/new",
    });
    expect(state.updated).toEqual([
      { id: "code_1", fields: ["destinationUrl"] },
    ]);
  });
});

describe("version history across types", () => {
  it("lists the type change and restores either way", async () => {
    const { data } = await patch({
      kind: "page",
      page: { type: "links", title: "Our links" },
    });
    const pageId = data.pageId as string;

    const { entries } = await listCodeVersions(SCOPE, "code_1");
    expect(entries[0]?.changes).toContainEqual(
      expect.objectContaining({
        field: "kind",
        label: "Type",
        from: "Website link",
        to: "Hosted page (Our links, Link list)",
      }),
    );

    // Back to the website link it was.
    const [redirectVersion] = fakeDb.rows("qrCodeVersion");
    const undo = await restoreCodeVersion(
      SCOPE,
      "code_1",
      redirectVersion?.id as string,
    );
    expect(undo.skipped).toEqual([]);
    expect(code()).toMatchObject({
      kind: "redirect",
      pageId: null,
      destinationUrl: "https://cafe.example/menu",
    });

    // And forward to the page again (the restore saved it as a version).
    const pageVersion = fakeDb
      .rows("qrCodeVersion")
      .find((row) => (row.snapshot as Record<string, unknown>).kind === "page");
    await restoreCodeVersion(SCOPE, "code_1", pageVersion?.id as string);
    expect(code()).toMatchObject({
      kind: "page",
      pageId,
      destinationUrl: `${SHORT_LINK_BASE}/p/Menu123`,
    });
  });

  it("leaves the type alone when the page was deleted since", async () => {
    const { data } = await patch({ kind: "page", page: { type: "links" } });
    await patch({ kind: "redirect", destinationUrl: "https://cafe.example/b" });
    await deletePage(SCOPE, data.pageId as string);
    const pageVersion = fakeDb
      .rows("qrCodeVersion")
      .find((row) => (row.snapshot as Record<string, unknown>).kind === "page");
    const result = await restoreCodeVersion(
      SCOPE,
      "code_1",
      pageVersion?.id as string,
    );
    expect(result.skipped).toEqual(expect.arrayContaining(["Type"]));
    expect(code()).toMatchObject({
      kind: "redirect",
      destinationUrl: "https://cafe.example/b",
    });
  });
});

describe("shared rules", () => {
  it("uses the page settings block's type", () => {
    expect(shared.PAGE_SETTINGS_TYPE).toBe(PAGE_SETTINGS_TYPE);
  });

  it("switchCodeKind refuses viewers", async () => {
    await expect(
      switchCodeKind({ ...SCOPE, role: "viewer" }, "code_1", {
        kind: "page",
        page: { type: "links", title: null },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
