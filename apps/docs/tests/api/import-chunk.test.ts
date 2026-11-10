// One chunk of the dashboard's CSV import (app/dashboard/codes/import/_lib/
// import.ts): the batch's folder and tags, the chunk's idempotency key (a
// chunk sent twice makes its codes once) and a back-half taken since the
// preview (that row gets a generated one, the rest go through). Real codes
// service against in-memory tables.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro",
  /** The import's own slug check misses this many times (a race). */
  missTaken: 0,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 20,
      remaining: 19,
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
  getDefaultThemeStyle: async () => ({ fgColor: "#123456" }),
}));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
}));
vi.mock("@/lib/events/emit", () => ({ emitCodesCreated: () => {} }));
vi.mock("@/lib/slug-claims", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/slug-claims")>();
  return {
    ...actual,
    findTakenSlugs: async (
      ...args: Parameters<typeof actual.findTakenSlugs>
    ) => {
      if (state.missTaken > 0) {
        state.missTaken--;
        return new Set<string>();
      }
      return actual.findTakenSlugs(...args);
    },
  };
});
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));

const { importChunk } = await import(
  "@/app/dashboard/codes/import/_lib/import"
);

const scope = {
  userId: "u_alice",
  organizationId: "org_a",
  role: "owner" as const,
};

const row = (line: number, patch: Record<string, string> = {}) => ({
  line,
  destination: `https://example.com/${line}`,
  title: `Row ${line}`,
  folder: "",
  tags: "",
  slug: "",
  ...patch,
});

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
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "id");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCodeTag", "qrCodeId", "tagId");
  fakeDb.seed("folder", [
    {
      id: "f_spring",
      userId: "u_alice",
      organizationId: "org_a",
      name: "Spring",
      parentId: null,
      position: 0,
    },
  ]);
  fakeDb.seed("tag", [
    {
      id: "t_print",
      userId: "u_alice",
      organizationId: "org_a",
      name: "print",
      color: "gray",
    },
    {
      id: "t_other",
      userId: "u_bob",
      organizationId: "org_b",
      name: "theirs",
      color: "gray",
    },
  ]);
  fakeDb.seed("user", [
    { id: "u_alice", role: "user", createdAt: new Date(0) },
  ]);
  state.plan = "pro";
  state.missTaken = 0;
});

const tagsOf = (codeId: string) =>
  fakeDb
    .rows("qrCodeTag")
    .filter((pair) => pair.qrCodeId === codeId)
    .map((pair) => pair.tagId)
    .sort();

describe("importChunk", () => {
  it("files rows without a folder into the batch's folder and adds its tags", async () => {
    const result = await importChunk(
      scope,
      [row(2), row(3, { folder: "Menus", tags: "table" })],
      null,
      { folderId: "f_spring", tagIds: ["t_print"] },
    );
    expect(result.rows.every((item) => item.ok)).toBe(true);
    expect(result.style).toEqual({ fgColor: "#123456" });
    const [first, second] = result.rows.map((item) => item.code?.id as string);
    const codes = fakeDb.rows("qrCode");
    expect(codes.find((code) => code.id === first)?.folderId).toBe("f_spring");
    const menus = fakeDb.rows("folder").find((f) => f.name === "Menus");
    expect(codes.find((code) => code.id === second)?.folderId).toBe(menus?.id);
    expect(tagsOf(first as string)).toEqual(["t_print"]);
    const table = fakeDb.rows("tag").find((t) => t.name === "table");
    expect(tagsOf(second as string)).toEqual(
      ["t_print", table?.id as string].sort(),
    );
  });

  it("makes a chunk's codes once, however often it's sent", async () => {
    const chunk = [row(2), row(3), row(4)];
    const options = { idempotencyKey: "import:job-1:0", tagIds: ["t_print"] };
    const first = await importChunk(scope, chunk, null, options);
    const again = await importChunk(scope, chunk, null, options);
    expect(again.rows.map((item) => item.code?.id)).toEqual(
      first.rows.map((item) => item.code?.id),
    );
    expect(fakeDb.rows("qrCode")).toHaveLength(3);
    expect(fakeDb.rows("qrCodeTag")).toHaveLength(3);
  });

  it("reports a back-half taken before the chunk as the row's problem", async () => {
    fakeDb.seed("qrCode", [
      {
        id: "elsewhere",
        userId: "u_bob",
        organizationId: "org_b",
        slug: "spring-menu",
        slugScope: "",
        destinationUrl: "https://example.com/other",
      },
    ]);
    const result = await importChunk(
      scope,
      [row(2, { slug: "spring-menu" }), row(3)],
      null,
    );
    expect(result.rows[0]).toMatchObject({
      ok: false,
      message: "This back-half is already in use",
    });
    expect(result.rows[1]?.ok).toBe(true);
  });

  it("gives a row whose back-half was taken during the chunk a generated one", async () => {
    // The chunk's own check passed; then another code took the back-half.
    state.missTaken = 1;
    fakeDb.seed("qrCode", [
      {
        id: "elsewhere",
        userId: "u_bob",
        organizationId: "org_b",
        slug: "spring-menu",
        slugScope: "",
        destinationUrl: "https://example.com/other",
      },
    ]);
    const result = await importChunk(
      scope,
      [row(2, { slug: "spring-menu" }), row(3, { slug: "spring-drinks" })],
      null,
    );
    const [taken, free] = result.rows;
    expect(taken).toMatchObject({
      ok: true,
      message: expect.stringContaining("spring-menu was taken"),
    });
    expect(taken?.code?.slug).not.toBe("spring-menu");
    expect(free).toMatchObject({ ok: true, code: { slug: "spring-drinks" } });
  });

  it("refuses a batch tag of another workspace", async () => {
    await expect(
      importChunk(scope, [row(2)], null, { tagIds: ["t_other"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });
});
