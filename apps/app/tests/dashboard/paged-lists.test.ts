// The dashboard tables page on the server: the codes list (with its Type and
// Domain filters), the pages list (searched and filtered in SQL, no longer
// cut at 500 and filtered in memory) and an endpoint's webhook deliveries
// (Next without a total). Rows that tie on the sort key show up exactly once
// across pages, filters hold on every page, and a page past the end shows
// the last one. Runs the real queries against in-memory tables.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, pending: Promise.resolve() }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "business",
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));

const { listCodes } = await import("@/app/(app)/dashboard/codes/_lib/qr-codes");
const { codesQueryOf, parseCodesFilters } = await import(
  "@/app/(app)/dashboard/codes/_lib/organize-shared"
);
const { listPages, listPageTypes } = await import(
  "@/app/(app)/dashboard/pages/_lib/landing-pages"
);
const { listDeliveries } = await import("@/lib/events/endpoints");
const { takePage } = await import("@/app/(app)/dashboard/_lib/list-paging");
const { loadPage } = await import("@/lib/paging");

const ORG = "org_acme";
const SCOPE = { userId: "u_ana", organizationId: ORG, role: "owner" as const };
/** One instant for every row, so only the id tie-breaker orders them. */
const SAME = new Date("2026-11-13T09:00:00Z");

/**
 * 0..count-1 in a scrambled order (count must not be a multiple of 37). Rows
 * are seeded this way so only the ORDER BY's id tie-breaker can put them back
 * in order: the in-memory sort is stable, so without it they'd come back as
 * seeded.
 */
const scrambled = (count: number) =>
  Array.from({ length: count }, (_, index) => (index * 37) % count);

/** Ids from `prefix` + 000.. in descending order: newest-made first. */
const descendingIds = (prefix: string, count: number) =>
  Array.from(
    { length: count },
    (_, index) => `${prefix}${String(count - 1 - index).padStart(3, "0")}`,
  );

/** Reads every page of `size` and returns the ids in order. */
async function readAll(
  load: (offset: number, limit: number) => Promise<{ id: string }[]>,
  size: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += size) {
    const rows = await load(offset, size);
    ids.push(...rows.map((row) => row.id));
    if (rows.length < size) return ids;
  }
}

function seedCodes(
  count: number,
  at: (index: number) => Partial<Row> = () => ({}),
) {
  fakeDb.seed(
    "qrCode",
    scrambled(count).map((index) => ({
      id: `code_${String(index).padStart(3, "0")}`,
      userId: "u_ana",
      organizationId: ORG,
      slug: `slug${index}`,
      slugScope: "",
      kind: "redirect",
      pageId: null,
      destinationUrl: `https://example.com/${index}`,
      contentType: "url",
      title: `Code ${index}`,
      style: {},
      domainId: null,
      folderId: null,
      notes: null,
      isFavorite: false,
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
      createdAt: SAME,
      updatedAt: SAME,
      ...at(index),
    })),
  );
}

type Row = Record<string, unknown>;

beforeEach(() => {
  fakeDb.resetAll();
});

describe("codes list", () => {
  it("shows codes made in one batch exactly once across pages", async () => {
    seedCodes(60);
    const ids = await readAll(
      async (offset, limit) =>
        (await listCodes(SCOPE, { limit, offset })).codes,
      25,
    );
    // Every code once, ordered by id where created_at ties.
    expect(ids).toEqual(descendingIds("code_", 60));
  });

  it("applies the Type and Domain filters on every page", async () => {
    seedCodes(40, (index) => ({
      kind: index % 2 === 0 ? "page" : "redirect",
      pageId: index % 2 === 0 ? `page_${index}` : null,
      domainId: index % 4 === 0 ? "dom_1" : null,
    }));
    const pagesOnDomain = codesQueryOf(
      parseCodesFilters({ type: "page", domain: "dom_1" }),
    );
    const first = await listCodes(SCOPE, {
      ...pagesOnDomain,
      limit: 5,
      offset: 0,
    });
    expect(first.total).toBe(10);
    const ids = await readAll(
      async (offset, limit) =>
        (await listCodes(SCOPE, { ...pagesOnDomain, limit, offset })).codes,
      5,
    );
    expect(ids).toHaveLength(10);
    for (const id of ids) expect(Number(id.slice(5)) % 4).toBe(0);

    const linksOnDefault = codesQueryOf(
      parseCodesFilters({ type: "link", domain: "default" }),
    );
    const links = await listCodes(SCOPE, {
      ...linksOnDefault,
      limit: 50,
      offset: 0,
    });
    expect(links.total).toBe(20);
    expect(links.codes.every((code) => code.kind === "redirect")).toBe(true);
  });

  it("shows the last page for a page past the end", async () => {
    seedCodes(30);
    const load = (page: number) =>
      listCodes(SCOPE, { limit: 25, offset: (page - 1) * 25 });
    const past = await loadPage(9, load, 25);
    expect(past.page).toBe(2);
    expect(past.codes).toHaveLength(5);
    fakeDb.reset();
    const empty = await loadPage(3, load, 25);
    expect(empty).toMatchObject({ page: 1, total: 0, codes: [] });
  });
});

function seedPages(
  count: number,
  at: (index: number) => Partial<Row> = () => ({}),
) {
  fakeDb.seed(
    "landingPage",
    scrambled(count).map((index) => ({
      id: `page_${String(index).padStart(3, "0")}`,
      userId: "u_ana",
      organizationId: ORG,
      type: "links",
      title: `Page ${index}`,
      content: { version: 1, theme: {}, blocks: [] },
      version: 1,
      createdAt: SAME,
      updatedAt: SAME,
      ...at(index),
    })),
  );
}

describe("pages list", () => {
  it("pages past 500 with no repeats when every page was saved at once", async () => {
    seedPages(530);
    const first = await listPages(SCOPE, { limit: 100 });
    expect(first.total).toBe(530);
    const ids = await readAll(
      async (offset, limit) =>
        (await listPages(SCOPE, { limit, offset })).pages,
      100,
    );
    expect(ids).toEqual(descendingIds("page_", 530));
  });

  it("filters by type and searches titles, type names and links in SQL", async () => {
    seedPages(12, (index) => ({
      type: index < 4 ? "feedback" : "links",
      title: index === 7 ? "Spring menu" : `Page ${index}`,
    }));
    fakeDb.seed("qrCode", [
      {
        id: "code_p9",
        userId: "u_ana",
        organizationId: ORG,
        slug: "WinterDrinks",
        slugScope: "",
        kind: "page",
        pageId: "page_009",
        domainId: null,
        deletedAt: null,
        createdAt: SAME,
      },
    ]);

    expect(await listPageTypes(SCOPE)).toEqual(["feedback", "links"]);

    const feedback = await listPages(SCOPE, { type: "feedback", limit: 3 });
    expect(feedback.total).toBe(4);
    expect(feedback.pages).toHaveLength(3);
    const rest = await listPages(SCOPE, {
      type: "feedback",
      limit: 3,
      offset: 3,
    });
    expect(rest.pages.map((page) => page.type)).toEqual(["feedback"]);

    const titled = await listPages(SCOPE, { q: "spring", limit: 25 });
    expect(titled.pages.map((page) => page.id)).toEqual(["page_007"]);

    const linked = await listPages(SCOPE, {
      q: "https://qrdx.dev/p/winterdrinks",
      limit: 25,
    });
    expect(linked.pages.map((page) => page.id)).toEqual(["page_009"]);

    // "%" is a character to find, not a wildcard.
    expect((await listPages(SCOPE, { q: "%", limit: 25 })).total).toBe(0);
  });

  it("only lists the workspace's own pages", async () => {
    seedPages(3);
    seedPages(2, (index) => ({
      id: `other_${index}`,
      organizationId: "org_other",
    }));
    expect((await listPages(SCOPE, { limit: 25 })).total).toBe(3);
  });
});

describe("webhook deliveries", () => {
  beforeEach(() => {
    fakeDb.seed("webhookEndpoint", [
      {
        id: "ep_1",
        userId: "u_ana",
        organizationId: ORG,
        url: "https://example.com/hook",
        events: ["code.scanned"],
        secret: "whsec_x",
        active: true,
        createdAt: SAME,
        updatedAt: SAME,
      },
    ]);
    fakeDb.seed(
      "webhookDelivery",
      scrambled(120).map((index) => ({
        id: `del_${String(index).padStart(3, "0")}`,
        endpointId: "ep_1",
        event: "code.scanned",
        payload: {},
        status: index % 3 === 0 ? "failed" : "succeeded",
        attempts: 1,
        nextAttemptAt: null,
        lastError: null,
        createdAt: SAME,
      })),
    );
  });

  /** One page as the deliveries page reads it: 50 rows plus one to peek. */
  const page = async (number: number, status?: "failed") =>
    takePage(
      await listDeliveries(SCOPE, "ep_1", {
        status,
        limit: 51,
        offset: (number - 1) * 50,
      }),
      50,
    );

  it("pages without counting, each delivery once", async () => {
    const one = await page(1);
    const two = await page(2);
    const three = await page(3);
    expect([one.hasMore, two.hasMore, three.hasMore]).toEqual([
      true,
      true,
      false,
    ]);
    const ids = [...one.rows, ...two.rows, ...three.rows].map((row) => row.id);
    expect(ids).toEqual(descendingIds("del_", 120));
    expect(three.rows).toHaveLength(20);
    expect((await page(4)).rows).toEqual([]);
  });

  it("keeps the status filter on every page", async () => {
    const one = await page(1, "failed");
    expect(one.rows).toHaveLength(40);
    expect(one.hasMore).toBe(false);
    expect(one.rows.every((row) => row.status === "failed")).toBe(true);
  });

  it("refuses another workspace's endpoint", async () => {
    await expect(
      listDeliveries(
        { userId: "u_eve", organizationId: "org_eve", role: "owner" },
        "ep_1",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
