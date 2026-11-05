// Remix lineage: a saved theme copied from a community item, changed and
// published again, is a remix. It credits the original ("Navy by bob"),
// links to it while it's published, counts on the original and shows in its
// Remixes; an unchanged copy is refused as a duplicate. In-memory tables.
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
import { copyItemToWorkspace } from "@/lib/community/copies";
import { publishSavedTheme, unpublishItem } from "@/lib/community/publish";
import { getItem, remixesOf } from "@/lib/community/queries";
import { fakeDb } from "../support/fake-db";

const OWN = ownWorkspaceId("u_ana");

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

const NAVY = { fgColor: "#1E3A8A", bgColor: "#FFFFFF", level: "M" as const };

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

describe("remix lineage", () => {
  async function bobsTheme() {
    return publishSavedTheme({
      userId: "u_bob",
      theme: { id: "t_bob", name: "Navy", style: NAVY },
      tags: [],
    });
  }

  it("credits the original when a changed copy is published, and lists it as a remix", async () => {
    const original = await bobsTheme();
    const copy = await copyItemToWorkspace(
      { userId: "u_ana", organizationId: OWN, role: "owner" },
      { type: "theme", slug: original.slug },
    );
    // An unchanged copy is the same design: refused as a duplicate.
    const saved = fakeDb.find("qrPreset", { id: copy.themeId });
    await expect(
      publishSavedTheme({
        userId: "u_ana",
        theme: { id: copy.themeId, name: "Mine", style: saved?.style as never },
        tags: [],
      }),
    ).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" });

    const remix = await publishSavedTheme({
      userId: "u_ana",
      theme: {
        id: copy.themeId,
        name: "Navy, darker",
        style: { ...NAVY, fgColor: "#172554", dotColor: "#172554" },
      },
      tags: [],
    });
    expect(fakeDb.find("communityItem", { id: remix.id })).toMatchObject({
      remixedFromItemId: original.id,
      remixedFromVersion: 1,
      remixedFromLabel: "Navy by bob",
    });
    expect(fakeDb.find("communityItem", { id: original.id })?.remixCount).toBe(
      1,
    );

    const detail = await getItem("theme", remix.slug, null);
    expect(detail).toMatchObject({
      remixedFromLabel: "Navy by bob",
      remixedFrom: { type: "theme", slug: original.slug },
    });
    expect((await getItem("theme", original.slug, null))?.remixCount).toBe(1);
    expect((await remixesOf(original.id)).map((card) => card.slug)).toEqual([
      remix.slug,
    ]);

    // The credit survives the original's removal; the link goes.
    await unpublishItem("u_bob", original.id);
    expect(await getItem("theme", remix.slug, null)).toMatchObject({
      remixedFromLabel: "Navy by bob",
      remixedFrom: null,
    });
  });

  it("leaves designs that weren't copied from the community alone", async () => {
    const own = await publishSavedTheme({
      userId: "u_ana",
      theme: { id: "t_mine", name: "Mine", style: NAVY },
      tags: [],
    });
    expect(fakeDb.find("communityItem", { id: own.id })).toMatchObject({
      remixedFromItemId: null,
      remixedFromLabel: null,
    });
  });
});
