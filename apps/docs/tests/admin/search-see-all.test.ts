// /admin/search shows 8 matches a group. It reads a ninth to know there are
// more ("8+" only then), and links the users, codes and hosted pages groups
// to the paged list with the same search.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

import { parseAdminSearch } from "@/app/(app)/admin/_lib/rules";
import {
  runAdminSearch,
  SEARCH_GROUP_LIMIT,
  seeAllHref,
} from "@/app/(app)/admin/_lib/search";
import { fakeDb } from "../support/fake-db";

const AT = new Date("2026-11-01T09:00:00Z");

function seedUsers(count: number) {
  fakeDb.seed(
    "user",
    Array.from({ length: count }, (_, i) => ({
      id: `user_${i}`,
      email: `maria.${i}@example.com`,
      name: `Maria ${i}`,
      emailVerified: true,
      role: null,
      banned: false,
      createdAt: AT,
      updatedAt: AT,
    })),
  );
}

const search = (q: string) => {
  const parsed = parseAdminSearch(q);
  if (!parsed) throw new Error(`no search for ${q}`);
  return parsed;
};

beforeEach(() => fakeDb.resetAll());

describe("a group at its limit", () => {
  it("says there are more only when there are", async () => {
    seedUsers(SEARCH_GROUP_LIMIT);
    const exactly = await runAdminSearch(search("user:maria"));
    expect(exactly.users.rows).toHaveLength(SEARCH_GROUP_LIMIT);
    expect(exactly.users.more).toBe(false);

    fakeDb.resetAll();
    seedUsers(SEARCH_GROUP_LIMIT + 3);
    const over = await runAdminSearch(search("user:maria"));
    expect(over.users.rows).toHaveLength(SEARCH_GROUP_LIMIT);
    expect(over.users.more).toBe(true);
    // Newest first, the id breaking the tie.
    expect(over.users.rows[0]?.id).toBe("user_9");
  });

  it("groups that weren't searched are empty", async () => {
    seedUsers(2);
    const results = await runAdminSearch(search("user:maria"));
    expect(results.codes).toEqual({ rows: [], more: false });
    expect(results.teams).toEqual({ rows: [], more: false });
  });
});

describe("See all", () => {
  it("users go to the users list with the term", () => {
    expect(seeAllHref(search("user:maria lopez"), "users")).toBe(
      "/admin/users?q=maria+lopez",
    );
  });

  it("codes leave page codes to the pages group when both are searched", () => {
    expect(seeAllHref(search("summer"), "codes")).toBe(
      "/admin/codes?q=summer&kind=redirect",
    );
    expect(seeAllHref(search("code:summer"), "codes")).toBe(
      "/admin/codes?q=summer",
    );
    expect(seeAllHref(search("summer"), "pages")).toBe(
      "/admin/codes?q=summer&kind=page",
    );
  });

  it("a pasted short link searches by its slug", () => {
    expect(seeAllHref(search("https://qrdx.dev/p/menu-2"), "pages")).toBe(
      "/admin/codes?q=menu-2&kind=page",
    );
  });
});
