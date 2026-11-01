// Custom back-halves, as content/docs/dynamic-qr-codes.mdx (#custom-back-halves),
// custom-domains.mdx and plans-and-limits.mdx describe them: Pro and Business
// choose a code's back-half (3–64 of A–Z a–z 0–9 - _, no dash at either end,
// case-sensitive); on qrdx.dev it's unique across QRdx and QRdx words are
// reserved; on a custom domain it's unique on that domain only. Runs the real
// codes service and REST routes against in-memory tables with the indexes of
// manual-sql/0009 (and, where it says so, without the global one 0010 drops).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  /** Custom domains of the workspace by id */
  domains: new Map<string, { hostname: string; verified: boolean }>(),
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
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "u_alice" },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/app/dashboard/domains/_lib/domains", async () => {
  const { HttpError } = await import("@/lib/error-response");
  return {
    getDomainRefs: async (ids: (string | null)[]) =>
      new Map(
        ids.flatMap((id) => {
          const domain = id ? state.domains.get(id) : undefined;
          return id && domain ? [[id, { id, ...domain }] as const] : [];
        }),
      ),
    assertBindableDomains: async (_scope: unknown, ids: string[]) => {
      for (const id of ids) {
        if (!state.domains.get(id)?.verified) {
          throw new HttpError(404, "NOT_FOUND", "Custom domain not found.");
        }
      }
    },
  };
});
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
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const list = await import("@/app/api/v1/codes/route");
const one = await import("@/app/api/v1/codes/[id]/route");
const { checkSlugAvailability } = await import(
  "@/app/dashboard/codes/_lib/qr-codes"
);
const { releaseDomainSlugs, findTakenSlugs } = await import(
  "@/lib/slug-claims"
);

const ORIGIN = "http://localhost:3000";
const SCOPE = {
  userId: "u_alice",
  organizationId: null,
  role: "owner" as const,
};

/** The indexes of 0009; `afterContract` = also 0010 (no global slug unique). */
function indexes({ afterContract = false } = {}) {
  if (!afterContract) fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
}

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.seed("user", [{ id: "u_alice", banned: false, banExpires: null }]);
  state.plan = "pro";
  state.domains = new Map([
    ["dom_brand", { hostname: "go.brand.com", verified: true }],
    ["dom_other", { hostname: "go.other.com", verified: true }],
  ]);
});

let seq = 0;
function seedCode(overrides: Record<string, unknown>) {
  seq += 1;
  fakeDb.seed("qrCode", [
    {
      id: `seed_${seq}`,
      userId: "u_someone",
      organizationId: null,
      destinationUrl: "https://example.com/theirs",
      ...overrides,
    },
  ]);
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json", origin: ORIGIN },
  body: JSON.stringify(body),
});
const create = (body: unknown) =>
  list.POST(new NextRequest(new URL("/api/v1/codes", ORIGIN), json(body)));
const patch = (id: string, body: unknown) =>
  one.PATCH(
    new NextRequest(new URL(`/api/v1/codes/${id}`, ORIGIN), {
      ...json(body),
      method: "PATCH",
    }),
    { params: Promise.resolve({ id }) },
  );

interface CodeJson {
  id: string;
  slug: string;
  shortLink: string;
  defaultShortLink: string | null;
}
const dataOf = async (response: Response) =>
  ((await response.json()) as { data: CodeJson }).data;
const errorOf = async (response: Response) =>
  (await response.json()) as { code: string; message: string };

describe("POST /v1/codes with a slug", () => {
  beforeEach(() => indexes());

  it("creates the code at qrdx.dev/q/<slug>", async () => {
    const response = await create({
      destinationUrl: "https://example.com/menu",
      slug: "  spring-menu ",
    });
    expect(response.status).toBe(201);
    const data = await dataOf(response);
    expect(data.slug).toBe("spring-menu");
    expect(data.shortLink).toBe(`${ORIGIN}/q/spring-menu`);
    expect(data.defaultShortLink).toBe(`${ORIGIN}/q/spring-menu`);
    expect(fakeDb.find("qrCode", { id: data.id })?.slugScope).toBe("");
  });

  it("is a Pro and Business feature", async () => {
    state.plan = "free";
    const response = await create({
      destinationUrl: "https://example.com/menu",
      slug: "spring-menu",
    });
    expect(response.status).toBe(402);
    expect((await errorOf(response)).code).toBe("PLAN_REQUIRED");
    // Generated slugs stay free for everyone.
    expect(
      (await create({ destinationUrl: "https://example.com/menu" })).status,
    ).toBe(201);
  });

  it("validates the shape", async () => {
    for (const slug of [
      "ab",
      "a".repeat(65),
      "-menu",
      "menu-",
      "a b",
      "menü",
      "a/b",
      "",
    ]) {
      const response = await create({
        destinationUrl: "https://example.com",
        slug,
      });
      expect(response.status, JSON.stringify(slug)).toBe(400);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }
    for (const slug of ["abc", "Spring_Menu", "a".repeat(64), "2026-menu"]) {
      expect(
        (await create({ destinationUrl: "https://example.com", slug })).status,
        slug,
      ).toBe(201);
    }
    expect(fakeDb.rows("qrCode")).toHaveLength(4);
  });

  it("reserves QRdx words on qrdx.dev, case-insensitively", async () => {
    for (const slug of [
      "admin",
      "API",
      "Docs",
      "login",
      "pricing",
      "settings",
    ]) {
      const response = await create({
        destinationUrl: "https://example.com",
        slug,
      });
      expect(response.status, slug).toBe(400);
      expect((await errorOf(response)).code, slug).toBe("INVALID_SLUG");
    }
    const reserved = await create({
      destinationUrl: "https://example.com",
      slug: "Pricing",
    });
    expect(await errorOf(reserved)).toMatchObject({ code: "INVALID_SLUG" });
  });

  it("rejects a slug another code uses, and repeats within a batch", async () => {
    seedCode({ slug: "spring-menu" });
    const taken = await create({
      destinationUrl: "https://example.com",
      slug: "spring-menu",
    });
    expect(taken.status).toBe(409);
    expect((await errorOf(taken)).code).toBe("SLUG_TAKEN");
    // Case-sensitive: a different link.
    expect(
      (
        await create({
          destinationUrl: "https://example.com",
          slug: "Spring-Menu",
        })
      ).status,
    ).toBe(201);

    const twice = await create([
      { destinationUrl: "https://example.com/a", slug: "summer" },
      { destinationUrl: "https://example.com/b", slug: "summer" },
    ]);
    expect(twice.status).toBe(400);
    expect((await errorOf(twice)).code).toBe("INVALID_SLUG");
  });

  it("creates nothing from a batch when one chosen slug is taken", async () => {
    seedCode({ slug: "taken-one" });
    const before = fakeDb.rows("qrCode").length;
    const response = await create([
      { destinationUrl: "https://example.com/a" },
      { destinationUrl: "https://example.com/b", slug: "fresh-one" },
      { destinationUrl: "https://example.com/c", slug: "taken-one" },
    ]);
    expect(response.status).toBe(409);
    expect(fakeDb.rows("qrCode")).toHaveLength(before);
  });

  it("puts a domain's back-half only on that domain", async () => {
    const response = await create({
      destinationUrl: "https://example.com/menu",
      domainId: "dom_brand",
      // Reserved on qrdx.dev, fine on the customer's own domain.
      slug: "pricing",
    });
    expect(response.status).toBe(201);
    const data = await dataOf(response);
    expect(data.shortLink).toBe("https://go.brand.com/pricing");
    expect(data.defaultShortLink).toBeNull();
    expect(fakeDb.find("qrCode", { id: data.id })?.slugScope).toBe("dom_brand");
    // The domain's own paths stay reserved.
    const api = await create({
      destinationUrl: "https://example.com",
      domainId: "dom_brand",
      slug: "api",
    });
    expect((await errorOf(api)).code).toBe("INVALID_SLUG");
  });
});

describe("uniqueness per namespace (after 0010)", () => {
  beforeEach(() => indexes({ afterContract: true }));

  it("lets two custom domains and qrdx.dev each have the same back-half", async () => {
    seedCode({ slug: "spring-menu" });
    for (const domainId of ["dom_brand", "dom_other"]) {
      const response = await create({
        destinationUrl: `https://example.com/${domainId}`,
        domainId,
        slug: "spring-menu",
      });
      expect(response.status, domainId).toBe(201);
    }
    const again = await create({
      destinationUrl: "https://example.com",
      domainId: "dom_brand",
      slug: "spring-menu",
    });
    expect(again.status).toBe(409);
  });

  it("keeps a domain from serving one slug twice", async () => {
    // qrdx.dev/q/menu moved onto go.brand.com: go.brand.com/menu is taken.
    seedCode({ slug: "menu", domainId: "dom_brand" });
    const response = await create({
      destinationUrl: "https://example.com",
      domainId: "dom_brand",
      slug: "menu",
    });
    expect(response.status).toBe(409);
  });

  it("finds taken slugs in the right namespace", async () => {
    seedCode({ slug: "shared-one" });
    seedCode({
      slug: "brand-one",
      slugScope: "dom_brand",
      domainId: "dom_brand",
    });
    seedCode({ slug: "moved-one", domainId: "dom_brand" });
    const slugs = ["shared-one", "brand-one", "moved-one"];
    expect([...(await findTakenSlugs(slugs, null))].sort()).toEqual([
      "moved-one",
      "shared-one",
    ]);
    expect([...(await findTakenSlugs(slugs, "dom_brand"))].sort()).toEqual([
      "brand-one",
      "moved-one",
    ]);
    expect([...(await findTakenSlugs(slugs, "dom_other"))]).toEqual([]);
  });
});

describe("PATCH /v1/codes/{id} slug and domain", () => {
  beforeEach(() => indexes({ afterContract: true }));

  async function created(body: Record<string, unknown>) {
    return dataOf(
      await create({ destinationUrl: "https://example.com/x", ...body }),
    );
  }

  it("changes the back-half (Pro), and only then the link", async () => {
    const code = await created({});
    const renamed = await patch(code.id, { slug: "summer-menu" });
    expect(renamed.status).toBe(200);
    expect((await dataOf(renamed)).shortLink).toBe(`${ORIGIN}/q/summer-menu`);

    state.plan = "free";
    const blocked = await patch(code.id, { slug: "autumn-menu" });
    expect(blocked.status).toBe(402);
    // Same back-half and other edits stay allowed after a downgrade.
    expect(
      (await patch(code.id, { slug: "summer-menu", title: "Menu" })).status,
    ).toBe(200);
  });

  it("refuses a back-half another code uses", async () => {
    seedCode({ slug: "taken-menu" });
    const code = await created({});
    const response = await patch(code.id, { slug: "taken-menu" });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("SLUG_TAKEN");
  });

  it("moves a domain's back-half to qrdx.dev when it's free there", async () => {
    const code = await created({ domainId: "dom_brand", slug: "spring-menu" });
    const moved = await dataOf(await patch(code.id, { domainId: null }));
    expect(moved.slug).toBe("spring-menu");
    expect(moved.shortLink).toBe(`${ORIGIN}/q/spring-menu`);
    expect(fakeDb.find("qrCode", { id: code.id })?.slugScope).toBe("");
  });

  it("gives it a generated back-half when qrdx.dev has it or reserves it", async () => {
    seedCode({ slug: "spring-menu" });
    const taken = await created({ domainId: "dom_brand", slug: "spring-menu" });
    const reserved = await created({ domainId: "dom_brand", slug: "pricing" });
    // Moving back to the default link never needs Pro.
    state.plan = "free";
    for (const code of [taken, reserved]) {
      const moved = await dataOf(await patch(code.id, { domainId: null }));
      expect(moved.slug).toMatch(/^[0-9A-Za-z]{7}$/);
      expect(moved.defaultShortLink).toBe(`${ORIGIN}/q/${moved.slug}`);
    }
  });

  it("takes a domain's back-half along to another domain, or refuses", async () => {
    const code = await created({ domainId: "dom_brand", slug: "spring-menu" });
    const moved = await dataOf(await patch(code.id, { domainId: "dom_other" }));
    expect(moved.shortLink).toBe("https://go.other.com/spring-menu");
    expect(fakeDb.find("qrCode", { id: code.id })?.slugScope).toBe("dom_other");

    const other = await created({ domainId: "dom_brand", slug: "spring-menu" });
    const clash = await patch(other.id, { domainId: "dom_other" });
    expect(clash.status).toBe(409);
  });

  it("keeps a shared slug when a code moves onto a domain", async () => {
    const code = await created({});
    const moved = await dataOf(await patch(code.id, { domainId: "dom_brand" }));
    expect(moved.slug).toBe(code.slug);
    expect(moved.shortLink).toBe(`https://go.brand.com/${code.slug}`);
    // Printed qrdx.dev/q/<slug> codes keep working.
    expect(moved.defaultShortLink).toBe(code.shortLink);
  });
});

describe("the dialog's live check", () => {
  beforeEach(() => indexes());

  it("tells available, taken, invalid and plan apart", async () => {
    seedCode({ slug: "spring-menu" });
    const check = (slug: string, domainId: string | null = null) =>
      checkSlugAvailability(SCOPE, { slug, domainId });
    expect((await check("summer-menu")).status).toBe("available");
    expect((await check("spring-menu")).status).toBe("taken");
    expect((await check("pricing")).status).toBe("invalid");
    expect((await check("pricing", "dom_brand")).status).toBe("available");
    expect((await check("-x")).status).toBe("invalid");
    // Someone else's domain can't be probed.
    state.domains.delete("dom_other");
    expect((await check("anything", "dom_other")).status).toBe("invalid");
    state.plan = "free";
    expect((await check("summer-menu")).status).toBe("plan");
  });

  it("counts the code's own back-half as free", async () => {
    seedCode({ id: "mine", userId: "u_alice", slug: "my-menu" });
    expect(
      (
        await checkSlugAvailability(SCOPE, {
          slug: "my-menu",
          domainId: null,
          codeId: "mine",
        })
      ).status,
    ).toBe("available");
  });
});

describe("removing a custom domain", () => {
  beforeEach(() => indexes({ afterContract: true }));

  it("moves its back-halves to qrdx.dev when free, else generates new ones", async () => {
    seedCode({
      id: "free",
      slug: "free-menu",
      slugScope: "dom_brand",
      domainId: "dom_brand",
    });
    seedCode({
      id: "clash",
      slug: "spring-menu",
      slugScope: "dom_brand",
      domainId: "dom_brand",
    });
    seedCode({
      id: "reserved",
      slug: "pricing",
      slugScope: "dom_brand",
      domainId: "dom_brand",
    });
    seedCode({ id: "shared", slug: "spring-menu" });
    seedCode({ id: "generated", slug: "Ab3xK9q", domainId: "dom_brand" });

    expect(await releaseDomainSlugs("dom_brand")).toBe(2);
    const row = (id: string) => fakeDb.find("qrCode", { id });
    expect(row("free")).toMatchObject({
      slug: "free-menu",
      slugScope: "",
      domainId: null,
    });
    expect(row("clash")?.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(row("reserved")?.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(row("clash")?.slugScope).toBe("");
    // Shared slugs are untouched (the FK unbinds them when the row goes).
    expect(row("shared")?.slug).toBe("spring-menu");
    expect(row("generated")).toMatchObject({
      slug: "Ab3xK9q",
      domainId: "dom_brand",
    });
  });
});
