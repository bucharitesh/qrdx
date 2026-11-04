// Publishing a workspace's theme (actions/community-themes.ts publishTheme).
// The item belongs to the person who publishes it: an owner or admin of the
// open workspace (the same check as editing the theme) publishes a snapshot
// under their own profile; a member who can only see the theme, someone
// outside the workspace and a theme from another workspace are refused on
// the server, and nothing is written. The session and the open workspace
// are mocked; the queries run against in-memory tables, the scan gate is
// the real one. Nothing connects anywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "u_ana" as string | null,
  scope: null as null | {
    userId: string;
    organizationId: string;
    role: "owner" | "admin" | "member";
  },
  /** A /dashboard/<slug> the user can't open */
  missingWorkspace: false,
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
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.userId ? { user: { id: state.userId } } : null,
    },
  },
}));
vi.mock("@/lib/shared", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getCurrentUserId: async () => {
      if (!state.userId) throw new UnauthorizedError();
      return state.userId;
    },
  };
});
vi.mock("@/lib/scope", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  class WorkspaceNotFoundError extends Error {
    constructor() {
      super("Workspace not found");
      this.name = "WorkspaceNotFoundError";
    }
  }
  return {
    WorkspaceNotFoundError,
    getActiveScope: vi.fn(async () => {
      if (!state.userId) throw new UnauthorizedError();
      if (state.missingWorkspace) throw new WorkspaceNotFoundError();
      if (!state.scope) throw new Error("test: no scope set");
      return state.scope;
    }),
  };
});
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => null,
}));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { publishTheme } from "@/actions/community-themes";
import { fakeDb } from "../support/fake-db";

const NOW = new Date("2026-11-03T10:00:00Z");
const TEAM = "org_team";
const OTHER_TEAM = "org_other";
const SCANS_GREAT = { fgColor: "#000000", bgColor: "#ffffff", level: "M" };

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

function theme(
  id: string,
  userId: string,
  organizationId: string,
  style: Record<string, unknown> = SCANS_GREAT,
) {
  return {
    id,
    userId,
    organizationId,
    name: `${id} theme`,
    style,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const LICENSED = { acceptLicense: true };
const items = () => fakeDb.rows("communityItem");

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  state.scope = null;
  state.missingWorkspace = false;
  fakeDb.unique("communityProfile", "handle");
  fakeDb.unique("communityProfile", "userId", "kind");
  fakeDb.unique("communityItem", "type", "slug");
  fakeDb.defaults("communityProfile", {
    handle: null,
    bio: null,
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
  fakeDb.seed("user", [person("u_ana"), person("u_bob"), person("u_cy")]);
  fakeDb.seed("qrPreset", [
    // Saved in the team workspace by Bob; Ana and Cy are members there.
    theme("t_team", "u_bob", TEAM),
    // Another workspace's theme.
    theme("t_other", "u_cy", OTHER_TEAM),
    // Ana's own theme.
    theme("t_mine", "u_ana", ownWorkspaceId("u_ana")),
  ]);
});

describe("publishTheme with a workspace theme", () => {
  it("lets an admin publish it as a snapshot under their own profile", async () => {
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "admin" };

    const result = await publishTheme("t_team", ["minimal"], LICENSED);

    expect(result).toEqual({ success: true, data: { id: expect.any(String) } });
    expect(items()).toHaveLength(1);
    const [item] = items();
    const profile = fakeDb.find("communityProfile", { userId: "u_ana" });
    expect(profile).toBeTruthy();
    expect(item).toMatchObject({
      type: "theme",
      status: "published",
      createdBy: "u_ana",
      profileId: profile?.id,
      sourceKind: "qr_preset",
      sourceId: "t_team",
      payload: { style: expect.objectContaining({ fgColor: "#000000" }) },
    });
    // The theme itself stays the workspace's, as it was.
    expect(fakeDb.find("qrPreset", { id: "t_team" })).toMatchObject({
      userId: "u_bob",
      organizationId: TEAM,
    });
    // Nobody else's profile was made or used.
    expect(fakeDb.find("communityProfile", { userId: "u_bob" })).toBeFalsy();
  });

  it("lets the workspace owner publish it too, once", async () => {
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "owner" };

    expect(await publishTheme("t_team", [], LICENSED)).toMatchObject({
      success: true,
    });
    expect(await publishTheme("t_team", [], LICENSED)).toEqual({
      success: false,
      error: expect.objectContaining({ code: "ALREADY_PUBLISHED" }),
    });
    expect(items()).toHaveLength(1);
  });

  it("refuses a member who can only view the workspace's themes", async () => {
    state.userId = "u_cy";
    state.scope = { userId: "u_cy", organizationId: TEAM, role: "member" };

    const result = await publishTheme("t_team", [], LICENSED);

    expect(result).toEqual({
      success: false,
      error: {
        code: "THEME_NOT_FOUND",
        message:
          "Only owners and admins of this workspace can publish its themes.",
      },
    });
    expect(items()).toHaveLength(0);
    expect(fakeDb.rows("communityProfile")).toHaveLength(0);
  });

  it("refuses someone who isn't in the workspace", async () => {
    // Their open workspace is their own; the team's theme isn't in it.
    state.userId = "u_dan";
    state.scope = {
      userId: "u_dan",
      organizationId: ownWorkspaceId("u_dan"),
      role: "owner",
    };
    await expect(publishTheme("t_team", [], LICENSED)).rejects.toThrow(
      /not found/i,
    );

    // Or a /dashboard/<slug> they can't open.
    state.missingWorkspace = true;
    await expect(publishTheme("t_team", [], LICENSED)).rejects.toThrow(
      /not found/i,
    );
    expect(items()).toHaveLength(0);
  });

  it("refuses a theme from another workspace, even to an admin of this one", async () => {
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "admin" };

    await expect(publishTheme("t_other", [], LICENSED)).rejects.toThrow(
      /not found/i,
    );
    expect(items()).toHaveLength(0);
  });

  it("still needs the licence and a Great scan score", async () => {
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "admin" };
    fakeDb.seed("qrPreset", [
      theme("t_faint", "u_bob", TEAM, {
        fgColor: "#C8C8C8",
        bgColor: "#ffffff",
        eyeColor: "#C8C8C8",
        dotColor: "#C8C8C8",
      }),
    ]);

    expect(await publishTheme("t_team", [])).toEqual({
      success: false,
      error: expect.objectContaining({ code: "LICENSE_REQUIRED" }),
    });
    expect(await publishTheme("t_faint", [], LICENSED)).toEqual({
      success: false,
      error: expect.objectContaining({ code: "SCAN_GATE" }),
    });
    expect(items()).toHaveLength(0);
  });

  it("keeps publishing your own themes without asking for the workspace", async () => {
    const { getActiveScope } = await import("@/lib/scope");
    vi.mocked(getActiveScope).mockClear();

    expect(await publishTheme("t_mine", [], LICENSED)).toMatchObject({
      success: true,
    });
    expect(getActiveScope).not.toHaveBeenCalled();
    expect(items()[0]).toMatchObject({
      createdBy: "u_ana",
      sourceId: "t_mine",
    });
  });

  it("refuses workspace themes on the legacy gallery, which links the live row", async () => {
    // Legacy rows and no theme items yet: themes are still read from
    // community_theme (lib/community/store.ts).
    fakeDb.seed("communityTheme", [
      { id: "ct_1", themeId: "t_mine", userId: "u_ana", publishedAt: NOW },
    ]);
    state.scope = { userId: "u_ana", organizationId: TEAM, role: "admin" };

    expect(await publishTheme("t_team", [], LICENSED)).toEqual({
      success: false,
      error: expect.objectContaining({ code: "COMMUNITY_UNAVAILABLE" }),
    });
    expect(fakeDb.find("communityTheme", { themeId: "t_team" })).toBeFalsy();
    expect(items()).toHaveLength(0);
  });

  it("asks a signed-out visitor to sign in", async () => {
    state.userId = null;
    await expect(publishTheme("t_team", [], LICENSED)).rejects.toThrow(
      /unauthorized/i,
    );
  });
});
