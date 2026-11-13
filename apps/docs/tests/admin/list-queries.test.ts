// The paged admin lists (app/(app)/admin/_lib/queries.ts) against the
// in-memory database. Each one ends its ORDER BY on the row's id, so rows
// that tie on the timestamp (codes made in one batch share created_at) come
// in one order and show up exactly once across pages; a page past the end
// shows the last page; and the themes and integrations totals count the
// rows their lists can show (the same joins as the rows).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/migrate/server/repo", () => ({
  JOB_STORE_PROVIDER: "qrdx-import",
}));
vi.mock("@/lib/plans", () => ({ planForSubscriptionProduct: () => "pro" }));

import {
  listAuditLog,
  listDynamicCodes,
  listIntegrations,
  listSubscriptions,
  listThemes,
  listUsers,
} from "@/app/(app)/admin/_lib/queries";
import { loadPage, PAGE_SIZE } from "@/lib/paging";
import { fakeDb } from "../support/fake-db";

const SAME_MOMENT = new Date("2026-11-01T09:00:00Z");
const OWNER = { id: "user_owner", email: "owner@example.com" };

/** 0..n-1 in an order that is neither ascending nor descending. */
const shuffled = (n: number) =>
  Array.from({ length: n }, (_, i) => (i * 7) % n);

const id = (prefix: string, i: number) =>
  `${prefix}_${String(i).padStart(2, "0")}`;

const descending = (ids: string[]) => [...ids].sort().reverse();

function seedUser(userId: string, email: string, createdAt = SAME_MOMENT) {
  fakeDb.seed("user", [
    {
      id: userId,
      email,
      name: email.split("@")[0],
      emailVerified: true,
      role: null,
      banned: false,
      createdAt,
      updatedAt: createdAt,
    },
  ]);
}

/** Every page of a list, in order, as one array of ids. */
async function allPages<T extends { id: string }>(
  total: number,
  load: (page: number) => Promise<T[]>,
) {
  const pages: string[][] = [];
  for (let page = 1; page <= Math.ceil(total / PAGE_SIZE); page++) {
    pages.push((await load(page)).map((row) => row.id));
  }
  return pages;
}

beforeEach(() => {
  fakeDb.resetAll();
  seedUser(OWNER.id, OWNER.email, new Date("2026-01-01T00:00:00Z"));
});

describe("rows that share a timestamp", () => {
  it("codes from one batch show up exactly once, newest id first", async () => {
    const ids = shuffled(60).map((i) => id("code", i));
    fakeDb.seed(
      "qrCode",
      ids.map((codeId) => ({
        id: codeId,
        slug: codeId,
        kind: "redirect",
        title: null,
        destinationUrl: "https://example.com",
        isActive: true,
        pausedAt: null,
        archivedAt: null,
        deletedAt: null,
        scanCount: 0,
        lastScannedAt: null,
        organizationId: null,
        userId: OWNER.id,
        createdAt: SAME_MOMENT,
      })),
    );
    const pages = await allPages(60, async (page) => {
      const { codes, total } = await listDynamicCodes({ status: "all", page });
      expect(total).toBe(60);
      return codes;
    });
    expect(pages.map((page) => page.length)).toEqual([25, 25, 10]);
    expect(pages.flat()).toEqual(descending(ids));
  });

  it("users who signed up at the same moment", async () => {
    const ids = shuffled(30).map((i) => id("user", i));
    for (const userId of ids) seedUser(userId, `${userId}@example.com`);
    const pages = await allPages(31, async (page) => {
      const { users, total } = await listUsers({ page });
      expect(total).toBe(31);
      return users;
    });
    // The owner signed up first, so comes last.
    expect(pages.flat()).toEqual([...descending(ids), OWNER.id]);
  });

  it("subscriptions, integrations and audit log entries", async () => {
    const ids = shuffled(30).map((i) => id("row", i));
    fakeDb.seed(
      "subscription",
      ids.map((rowId) => ({
        id: rowId,
        status: "active",
        amount: 900,
        currency: "usd",
        recurringInterval: "month",
        currentPeriodEnd: SAME_MOMENT,
        cancelAtPeriodEnd: false,
        createdAt: SAME_MOMENT,
        userId: OWNER.id,
      })),
    );
    fakeDb.seed(
      "integration",
      ids.map((rowId) => ({
        id: rowId,
        provider: "slack",
        status: "active",
        lastSyncAt: null,
        createdAt: SAME_MOMENT,
        userId: OWNER.id,
      })),
    );
    fakeDb.seed(
      "adminAuditLog",
      ids.map((rowId) => ({
        id: rowId,
        action: "user.ban",
        targetType: "user",
        targetId: OWNER.id,
        metadata: null,
        createdAt: SAME_MOMENT,
        actorUserId: OWNER.id,
      })),
    );

    const subscriptions = await allPages(30, async (page) =>
      (await listSubscriptions({ page })).subscriptions.map((row) => ({
        id: row.id,
      })),
    );
    const integrations = await allPages(
      30,
      async (page) => (await listIntegrations({ page })).integrations,
    );
    const entries = await allPages(
      30,
      async (page) => (await listAuditLog({ page })).entries,
    );
    for (const pages of [subscriptions, integrations, entries]) {
      expect(pages.flat()).toEqual(descending(ids));
    }
  });

  it("saved and community themes, in both views", async () => {
    const ids = shuffled(30).map((i) => id("theme", i));
    fakeDb.seed(
      "qrPreset",
      ids.map((themeId) => ({
        id: themeId,
        name: themeId,
        userId: OWNER.id,
        createdAt: SAME_MOMENT,
      })),
    );
    fakeDb.seed(
      "communityTheme",
      ids.map((themeId) => ({
        id: `community_${themeId}`,
        themeId,
        userId: OWNER.id,
        publishedAt: SAME_MOMENT,
        likeCount: 0,
      })),
    );
    for (const view of ["saved", "community"] as const) {
      const pages = await allPages(30, async (page) => {
        const { themes, total } = await listThemes({ view, page });
        expect(total).toBe(30);
        return themes;
      });
      expect(pages.flat()).toEqual(descending(ids));
    }
  });
});

describe("a page past the end", () => {
  it("shows the last page, with the page it showed", async () => {
    const ids = shuffled(30).map((i) => id("code", i));
    fakeDb.seed(
      "qrCode",
      ids.map((codeId) => ({
        id: codeId,
        slug: codeId,
        kind: "redirect",
        destinationUrl: "https://example.com",
        isActive: true,
        userId: OWNER.id,
        createdAt: SAME_MOMENT,
      })),
    );
    const result = await loadPage(9, (page) =>
      listDynamicCodes({ status: "all", page }),
    );
    expect(result.page).toBe(2);
    expect(result.total).toBe(30);
    expect(result.codes.map((row) => row.id)).toEqual(
      descending(ids).slice(25),
    );
  });

  it("an empty list stays on page 1", async () => {
    const result = await loadPage(4, (page) =>
      listUsers({ q: "nobody", page }),
    );
    expect(result).toMatchObject({ page: 1, total: 0, users: [] });
  });
});

describe("totals count what the list can show", () => {
  it("themes: one whose owner is gone isn't counted", async () => {
    fakeDb.seed("qrPreset", [
      { id: "theme_a", name: "A", userId: OWNER.id, createdAt: SAME_MOMENT },
      { id: "theme_b", name: "B", userId: OWNER.id, createdAt: SAME_MOMENT },
      { id: "theme_c", name: "C", userId: "user_gone", createdAt: SAME_MOMENT },
    ]);
    fakeDb.seed("communityTheme", [
      {
        id: "community_a",
        themeId: "theme_a",
        userId: OWNER.id,
        publishedAt: SAME_MOMENT,
        likeCount: 2,
      },
      {
        id: "community_c",
        themeId: "theme_c",
        userId: "user_gone",
        publishedAt: SAME_MOMENT,
        likeCount: 0,
      },
    ]);
    const saved = await listThemes({ view: "saved", page: 1 });
    expect(saved.themes.map((row) => row.id)).toEqual(["theme_b", "theme_a"]);
    expect(saved.total).toBe(saved.themes.length);
    const community = await listThemes({ view: "community", page: 1 });
    expect(community.themes.map((row) => row.id)).toEqual(["theme_a"]);
    expect(community.total).toBe(1);
  });

  it("integrations: neither the import job store nor an orphan is counted", async () => {
    const row = (rowId: string, overrides: Record<string, unknown> = {}) => ({
      id: rowId,
      provider: "slack",
      status: "active",
      lastSyncAt: null,
      createdAt: SAME_MOMENT,
      userId: OWNER.id,
      ...overrides,
    });
    fakeDb.seed("integration", [
      row("int_a"),
      row("int_b", { status: "error" }),
      row("int_jobs", { provider: "qrdx-import" }),
      row("int_orphan", { userId: "user_gone" }),
    ]);
    const all = await listIntegrations({ page: 1 });
    expect(all.integrations.map((r) => r.id)).toEqual(["int_b", "int_a"]);
    expect(all.total).toBe(2);
    const errors = await listIntegrations({ status: "error", page: 1 });
    expect(errors.integrations.map((r) => r.id)).toEqual(["int_b"]);
    expect(errors.total).toBe(1);
  });
});
