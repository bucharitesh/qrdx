// Collections and kits (lib/community/bundles.ts): they only point at items
// already in the community, so they publish at once; a collection holds 2
// to 48 frames, themes and page templates in order, a kit a page template
// with a theme and/or frame, and "Use kit" copies the page as a draft and
// the look as a saved theme. In-memory tables; nothing connects anywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "u_ana" as string | null,
  scope: null as null | {
    userId: string;
    organizationId: string;
    role: "owner" | "admin" | "member" | "viewer";
  },
  plan: "free" as string,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/shared", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getCurrentUserId: async () => {
      if (!state.userId) throw new UnauthorizedError();
      return state.userId;
    },
    logError: vi.fn(),
  };
});
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => null,
}));
vi.mock("@/lib/scope", async (importOriginal) => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    ...(await importOriginal<typeof import("@/lib/scope")>()),
    getActiveScope: vi.fn(async () => {
      if (!state.userId) throw new UnauthorizedError();
      if (!state.scope) throw new Error("test: no scope set");
      return state.scope;
    }),
  };
});
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlan: async () => state.plan,
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/limit-notices", () => ({ noteLimitUsage: vi.fn() }));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { getOfficialFrame } from "qrdx";
import {
  copyCommunityKit,
  publishCommunityCollection,
  publishCommunityKit,
} from "@/actions/community";
import { bundleSources } from "@/lib/community/bundles";
import {
  publishFrame,
  publishPageTemplate,
  publishSavedTheme,
  unpublishItem,
} from "@/lib/community/publish";
import { getItem, listItems } from "@/lib/community/queries";
import { buildTemplateContent } from "@/lib/landing/templates";
import { fakeDb } from "../support/fake-db";

const OWN = ownWorkspaceId("u_ana");
const wifi = getOfficialFrame("wifi-card");
if (!wifi) throw new Error("no wifi-card frame");

function person(id: string) {
  return {
    id,
    name: id.replace("u_", ""),
    email: `${id}@example.com`,
    image: null,
    banned: false,
    banExpires: null,
  };
}

/** Bob publishes a theme, a frame and a page template; Ana saves two. */
async function seedItems() {
  const theme = await publishSavedTheme({
    userId: "u_bob",
    theme: {
      id: "t_navy",
      name: "Navy",
      style: { fgColor: "#1E3A8A", bgColor: "#FFFFFF", level: "M" },
    },
    tags: [],
  });
  const frame = await publishFrame({
    userId: "u_bob",
    frame: { style: "custom", spec: wifi?.spec, text: "Join our Wi-Fi" },
    details: { name: "Wi-Fi card" },
  });
  const page = await publishPageTemplate({
    userId: "u_bob",
    page: {
      id: "pg_links",
      type: "links",
      content: buildTemplateContent("links"),
    },
    details: { name: "Creator links" },
  });
  const removed = await publishSavedTheme({
    userId: "u_bob",
    theme: {
      id: "t_old",
      name: "Old",
      style: { fgColor: "#14532D", bgColor: "#FFFFFF", level: "M" },
    },
    tags: [],
  });
  for (const itemId of [theme.id, page.id]) {
    fakeDb.seed("communitySave", [
      { userId: "u_ana", itemId, createdAt: new Date() },
    ]);
  }
  const row = fakeDb.find("communityItem", { id: removed.id });
  if (row) row.status = "removed";
  return { theme, frame, page, removed };
}

const licensed = { name: "Café set", acceptLicense: true };

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  state.scope = { userId: "u_ana", organizationId: OWN, role: "owner" };
  state.plan = "free";
  fakeDb.unique("communityProfile", "handle");
  fakeDb.unique("communityItem", "type", "slug");
  fakeDb.unique("communityUse", "itemId", "userId", "kind", "day");
  fakeDb.defaults("communityProfile", {
    handle: null,
    bio: null,
    avatarUrl: null,
    verifiedAt: null,
    status: "active",
    workspaceId: null,
  });
  fakeDb.defaults("communityItem", {
    likeCount: 0,
    saveCount: 0,
    useCount: 0,
    remixCount: 0,
    featuredAt: null,
    remixedFromLabel: null,
    removedAt: null,
  });
  fakeDb.seed("user", [person("u_ana"), person("u_bob")]);
});

describe("collections", () => {
  it("offers what you saved and published, and publishes a collection in order", async () => {
    const { theme, frame, page } = await seedItems();
    const sources = await bundleSources("u_ana");
    expect(sources.map((source) => source.id).sort()).toEqual(
      [theme.id, page.id].sort(),
    );

    const result = await publishCommunityCollection({
      itemIds: [page.id, frame.id, theme.id],
      ...licensed,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { href: expect.stringMatching(/^\/community\/collections\/caf/) },
    });
    const collection = fakeDb.find("communityItem", { type: "collection" });
    expect(collection).toMatchObject({
      createdBy: "u_ana",
      status: "published",
      payload: { items: [page.id, frame.id, theme.id] },
    });
    const entries = fakeDb
      .rows("communityCollectionEntry")
      .filter((row) => row.collectionId === collection?.id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((row) => row.itemId);
    expect(entries).toEqual([page.id, frame.id, theme.id]);
    const detail = await getItem("collection", String(collection?.slug), null);
    expect(detail?.entries?.map((card) => card.type)).toEqual([
      "page-template",
      "frame",
      "theme",
    ]);
  });

  it("refuses fewer than 2 items, removed items and collections in collections", async () => {
    const { theme, frame, removed } = await seedItems();
    expect(
      await publishCommunityCollection({ itemIds: [theme.id], ...licensed }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      await publishCommunityCollection({
        itemIds: [theme.id, removed.id],
        ...licensed,
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      (
        await publishCommunityCollection({
          itemIds: [theme.id, frame.id],
          ...licensed,
        })
      ).ok,
    ).toBe(true);
    const nested = fakeDb.find("communityItem", { type: "collection" });
    expect(
      await publishCommunityCollection({
        itemIds: [theme.id, String(nested?.id)],
        name: "Nested",
        acceptLicense: true,
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      await publishCommunityCollection({
        itemIds: [theme.id, frame.id],
        name: "Again",
        acceptLicense: false,
      }),
    ).toMatchObject({ ok: false, code: "LICENSE_REQUIRED" });
  });
});

describe("kits", () => {
  it("publishes a page template with a theme and frame, and Use kit copies both", async () => {
    const { theme, frame, page } = await seedItems();
    expect(
      await publishCommunityKit({ page: page.id, ...licensed }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(
      await publishCommunityKit({
        page: theme.id,
        theme: page.id,
        ...licensed,
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });

    const result = await publishCommunityKit({
      page: page.id,
      theme: theme.id,
      frame: frame.id,
      ...licensed,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { href: expect.stringMatching(/^\/community\/kits\//) },
    });
    const kit = fakeDb.find("communityItem", { type: "kit" });
    expect(kit?.payload).toEqual({
      kit: { theme: theme.id, frame: frame.id, page: page.id },
    });
    const detail = await getItem("kit", String(kit?.slug), null);
    expect(detail?.kit).toEqual({
      page: page.id,
      theme: theme.id,
      frame: frame.id,
    });
    // The look is the theme with the frame on it, and the page comes along.
    expect(detail?.preview).toMatchObject({
      fgColor: "#1E3A8A",
      frame: expect.objectContaining({ style: "custom" }),
    });
    expect(detail?.page?.type).toBe("links");

    const used = await copyCommunityKit({ slug: String(kit?.slug) });
    expect(used).toMatchObject({
      ok: true,
      data: {
        name: "Creator links",
        themeName: "Café set",
        themeRefused: null,
      },
    });
    if (!used.ok) return;
    expect(fakeDb.find("landingPage", { id: used.data.pageId })).toMatchObject({
      organizationId: OWN,
      type: "links",
    });
    const saved = fakeDb.find("qrPreset", { name: "Café set" });
    expect(saved?.style).toMatchObject({
      fgColor: "#1E3A8A",
      frame: expect.objectContaining({
        style: "custom",
        text: "Join our Wi-Fi",
      }),
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("keeps the page when the plan's theme limit stops the look", async () => {
    const { theme, page } = await seedItems();
    expect(
      (
        await publishCommunityKit({
          page: page.id,
          theme: theme.id,
          ...licensed,
        })
      ).ok,
    ).toBe(true);
    // Free: 10 saved themes, all used.
    fakeDb.seed(
      "qrPreset",
      Array.from({ length: 10 }, (_, index) => ({
        id: `t_full_${index}`,
        userId: "u_ana",
        organizationId: OWN,
        name: `Theme ${index}`,
        style: {},
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    const kit = fakeDb.find("communityItem", { type: "kit" });
    const used = await copyCommunityKit({ slug: String(kit?.slug) });
    expect(used).toMatchObject({
      ok: true,
      data: {
        themeName: null,
        themeRefused: expect.stringMatching(/10 saved themes/),
      },
    });
  });
});

// Review G: a kit whose page template is gone isn't listed and says so on
// its page; a collection below 2 visible items is hidden.
describe("bundles with removed items", () => {
  it("hides a kit without its page template and shows it as unavailable", async () => {
    const { theme, page } = await seedItems();
    await publishCommunityKit({ page: page.id, theme: theme.id, ...licensed });
    const kit = fakeDb.find("communityItem", { type: "kit" });
    expect(await listItems({ type: "kit" })).toHaveLength(1);
    await unpublishItem("u_bob", page.id);
    expect(await listItems({ type: "kit" })).toEqual([]);
    expect(await getItem("kit", String(kit?.slug), null)).toMatchObject({
      unavailable: true,
    });
    expect(await copyCommunityKit({ slug: String(kit?.slug) })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("hides a collection once fewer than 2 of its items are visible", async () => {
    const { theme, frame } = await seedItems();
    await publishCommunityCollection({
      itemIds: [theme.id, frame.id],
      ...licensed,
    });
    const collection = fakeDb.find("communityItem", { type: "collection" });
    expect(await listItems({ type: "collection" })).toHaveLength(1);
    await unpublishItem("u_bob", frame.id);
    expect(await listItems({ type: "collection" })).toEqual([]);
    expect(
      await getItem("collection", String(collection?.slug), null),
    ).toBeNull();
  });
});
