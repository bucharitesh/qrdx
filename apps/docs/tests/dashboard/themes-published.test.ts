// The dashboard's "Published" badge on a saved theme. Since phase 1 of the
// community, themes are published as community_item rows (type "theme",
// source "qr_preset" + the theme id) and the gallery reads those once the
// backfill has run; community_theme is only read before that
// (lib/community/store.ts). The badge must read the same table the gallery
// does.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  community: { tables: true, themes: "items" as "items" | "legacy" },
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/community/store", () => ({
  communityState: async () => state.community,
}));

const { listVisibleThemes } = await import(
  "@/app/(app)/dashboard/themes/_lib/queries"
);

const ME = "u_me";
const scope = {
  userId: ME,
  organizationId: ownWorkspaceId(ME),
  role: "owner" as const,
};

function theme(id: string) {
  return {
    id,
    userId: ME,
    organizationId: ownWorkspaceId(ME),
    name: `Theme ${id}`,
    isDefault: false,
    style: { fgColor: "#111111" },
    createdAt: new Date("2026-11-01"),
    updatedAt: new Date("2026-11-01"),
  };
}

function item(sourceId: string, status: string, id = `ci_${sourceId}`) {
  return {
    id,
    type: "theme",
    sourceKind: "qr_preset",
    sourceId,
    createdBy: ME,
    status,
  };
}

const publishedNames = async () =>
  (await listVisibleThemes(scope))
    .filter((saved) => saved.isPublished)
    .map((saved) => saved.id)
    .sort();

beforeEach(() => {
  fakeDb.resetAll();
  state.community = { tables: true, themes: "items" };
  fakeDb.seed("qrPreset", [theme("a"), theme("b"), theme("c"), theme("d")]);
});

describe("the Published badge", () => {
  it("shows for themes published as community items", async () => {
    fakeDb.seed("communityItem", [
      item("a", "published"),
      // Hidden by moderation is still published (it can be unpublished).
      item("b", "hidden"),
      item("c", "removed"),
      // A frame item from the same id is not a published theme.
      { ...item("d", "published", "ci_frame"), type: "frame" },
    ]);
    expect(await publishedNames()).toEqual(["a", "b"]);
  });

  it("ignores a leftover community_theme row once themes are items", async () => {
    // Removed by moderation as an item, while its old row stays behind.
    fakeDb.seed("communityItem", [item("a", "removed")]);
    fakeDb.seed("communityTheme", [{ id: "ct_a", themeId: "a", userId: ME }]);
    expect(await publishedNames()).toEqual([]);
  });

  it("reads community_theme before the backfill", async () => {
    state.community = { tables: true, themes: "legacy" };
    fakeDb.seed("communityTheme", [{ id: "ct_b", themeId: "b", userId: ME }]);
    expect(await publishedNames()).toEqual(["b"]);
  });

  it("reads community_theme where the community tables don't exist", async () => {
    state.community = { tables: false, themes: "legacy" };
    fakeDb.seed("communityTheme", [{ id: "ct_c", themeId: "c", userId: ME }]);
    expect(await publishedNames()).toEqual(["c"]);
  });
});
