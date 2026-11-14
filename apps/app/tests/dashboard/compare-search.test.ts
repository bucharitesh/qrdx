// Analytics → Compare codes searches the whole workspace instead of offering
// only the 200 most scanned codes (app/(app)/dashboard/analytics/_lib).
// With nothing typed it lists the most scanned first and says when there
// are more; typing finds codes by title, back-half (or a pasted short link)
// and destination, never another workspace's or a trashed code. Compared
// codes get their names even when they aren't in that list. Runs the real
// queries against in-memory tables.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  scope: { userId: "u_ana", organizationId: "org_acme", role: "owner" },
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, pending: Promise.resolve() }),
  }),
}));
vi.mock("@/lib/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scope")>()),
  getActiveScope: async () => state.scope,
}));

const { CODE_OPTIONS_LIMIT, codeOptionsByIds, searchCodeOptions } =
  await import("@/app/(app)/dashboard/analytics/_lib/queries");
const { searchCompareCodes } = await import(
  "@/app/(app)/dashboard/analytics/_lib/actions"
);

const ORG = "org_acme";
const SCOPE = { userId: "u_ana", organizationId: ORG, role: "owner" as const };
const SAME = new Date("2026-11-13T09:00:00Z");

function code(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u_ana",
    organizationId: ORG,
    slug: id.replace(/_/g, ""),
    title: null,
    destinationUrl: `https://example.com/${id}`,
    scanCount: 0,
    deletedAt: null,
    createdAt: SAME,
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
});

describe("searchCodeOptions", () => {
  it("lists the most scanned first and says when there are more", async () => {
    // 70 codes, scans 0..69 with ties every two (35 distinct counts).
    fakeDb.seed(
      "qrCode",
      Array.from({ length: 70 }, (_, index) =>
        code(`c${String(index).padStart(3, "0")}`, {
          scanCount: Math.floor(index / 2),
        }),
      ),
    );
    const { options, more } = await searchCodeOptions(SCOPE);
    expect(options).toHaveLength(CODE_OPTIONS_LIMIT);
    expect(more).toBe(true);
    // Ties on scans and created_at break by id, newest-made first.
    expect(options.slice(0, 4).map((option) => option.id)).toEqual([
      "c069",
      "c068",
      "c067",
      "c066",
    ]);
  });

  it("finds codes beyond the most scanned by title, back-half or destination", async () => {
    fakeDb.seed("qrCode", [
      ...Array.from({ length: 250 }, (_, index) =>
        code(`busy_${index}`, { scanCount: 1000 + index }),
      ),
      code("quiet_1", { title: "Spring menu", scanCount: 0 }),
      code("quiet_2", { slug: "WinterDrinks", scanCount: 0 }),
      code("quiet_3", {
        destinationUrl: "https://cafe.example/allergens",
        scanCount: 0,
      }),
    ]);
    const ids = async (q: string) =>
      (await searchCodeOptions(SCOPE, { q })).options.map(
        (option) => option.id,
      );
    expect(await ids("spring")).toEqual(["quiet_1"]);
    expect(await ids("winterdr")).toEqual(["quiet_2"]);
    expect(await ids("https://qrdx.dev/q/WinterDrinks")).toEqual(["quiet_2"]);
    expect(await ids("allergens")).toEqual(["quiet_3"]);
    expect((await searchCodeOptions(SCOPE, { q: "spring" })).more).toBe(false);
  });

  it("only searches this workspace's codes that aren't in the trash", async () => {
    fakeDb.seed("qrCode", [
      code("mine", { title: "Menu" }),
      code("trashed", { title: "Menu", deletedAt: SAME }),
      code("theirs", { title: "Menu", organizationId: "org_other" }),
    ]);
    const { options } = await searchCodeOptions(SCOPE, { q: "menu" });
    expect(options.map((option) => option.id)).toEqual(["mine"]);
  });

  it("matches % and _ literally", async () => {
    fakeDb.seed("qrCode", [
      code("a", { title: "50% off" }),
      code("b", { title: "Five hundred off" }),
    ]);
    const { options } = await searchCodeOptions(SCOPE, { q: "%" });
    expect(options.map((option) => option.id)).toEqual(["a"]);
  });
});

describe("codeOptionsByIds", () => {
  it("names compared codes from this workspace only", async () => {
    fakeDb.seed("qrCode", [
      code("mine", { title: "Menu" }),
      code("theirs", { organizationId: "org_other" }),
    ]);
    const rows = await codeOptionsByIds(SCOPE, ["mine", "theirs", "gone"]);
    expect(rows.map((row) => row.id)).toEqual(["mine"]);
    expect(await codeOptionsByIds(SCOPE, [])).toEqual([]);
  });
});

describe("searchCompareCodes (the picker's server action)", () => {
  it("returns labels: the title, else the back-half", async () => {
    fakeDb.seed("qrCode", [
      code("titled", { title: "Table card", scanCount: 2 }),
      code("bare_1", { slug: "AbC123", scanCount: 1 }),
    ]);
    const result = await searchCompareCodes({ q: "" });
    expect(result).toEqual({
      ok: true,
      data: {
        options: [
          { id: "titled", label: "Table card" },
          { id: "bare_1", label: "/AbC123" },
        ],
        more: false,
      },
    });
  });

  it("refuses a search that's too long", async () => {
    const result = await searchCompareCodes({ q: "x".repeat(201) });
    expect(result.ok).toBe(false);
  });
});
