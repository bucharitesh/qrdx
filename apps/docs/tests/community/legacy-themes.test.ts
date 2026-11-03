// Phase 0 on today's gallery (actions/community-themes.ts, community_theme):
// banned accounts' themes are hidden, uploaded logos and image art never
// leave the saved theme, and publishing needs the CC0 licence and a Great
// server-side scan score. Real queries run against the in-memory fake
// database; the scorer is the real one. Nothing connects anywhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ userId: "u_ana" as string | null }));

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
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => null,
}));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { getCommunityThemes, publishTheme } from "@/actions/community-themes";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { fakeDb } from "../support/fake-db";

const NOW = new Date("2026-11-03T10:00:00Z");
const UPLOAD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

function person(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id.replace("u_", ""),
    email: `${id}@example.com`,
    image: null,
    banned: false,
    banExpires: null,
    ...extra,
  };
}

function savedTheme(
  id: string,
  userId: string,
  style: Record<string, unknown>,
  name = id,
) {
  return {
    id,
    userId,
    organizationId: ownWorkspaceId(userId),
    name,
    style,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  fakeDb.resetAll();
  state.userId = "u_ana";
  fakeDb.seed("user", [
    person("u_ana"),
    person("u_ban", { banned: true }),
    person("u_was", {
      banned: true,
      banExpires: new Date("2026-01-01T00:00:00Z"),
    }),
  ]);
  fakeDb.seed("qrPreset", [
    savedTheme("t_ana", "u_ana", {
      fgColor: "#111111",
      showLogo: true,
      customLogo: UPLOAD,
    }),
    savedTheme("t_icon", "u_ana", {
      showLogo: true,
      customLogo: logoIconDataUrl("wifi"),
    }),
    savedTheme("t_ban", "u_ban", { fgColor: "#222222" }),
    savedTheme("t_was", "u_was", { fgColor: "#333333" }),
  ]);
  fakeDb.seed("communityTheme", [
    {
      id: "ct_ana",
      themeId: "t_ana",
      userId: "u_ana",
      publishedAt: NOW,
      likeCount: 3,
    },
    {
      id: "ct_icon",
      themeId: "t_icon",
      userId: "u_ana",
      publishedAt: new Date(NOW.getTime() - 1000),
      likeCount: 1,
    },
    {
      id: "ct_ban",
      themeId: "t_ban",
      userId: "u_ban",
      publishedAt: NOW,
      likeCount: 9,
    },
    {
      id: "ct_was",
      themeId: "t_was",
      userId: "u_was",
      publishedAt: NOW,
      likeCount: 2,
    },
  ]);
});

describe("the legacy gallery", () => {
  it("hides themes by banned accounts, and shows them once a ban runs out", async () => {
    state.userId = null;
    const { themes } = await getCommunityThemes("popular");
    expect(themes.map((t) => t.id)).toEqual(["ct_ana", "ct_was", "ct_icon"]);
  });

  it("never returns an uploaded logo; quick icons are drawn again", async () => {
    state.userId = null;
    const { themes } = await getCommunityThemes("newest");
    const ana = themes.find((t) => t.id === "ct_ana");
    expect(ana?.styles).toEqual({ fgColor: "#111111", showLogo: false });
    const icon = themes.find((t) => t.id === "ct_icon");
    expect(icon?.styles.customLogo).toBe(logoIconDataUrl("wifi"));
    expect(JSON.stringify(themes)).not.toContain("base64");
  });

  it("never exposes the saved theme's id (its /playground link shows everything)", async () => {
    state.userId = null;
    const { themes } = await getCommunityThemes("popular");
    const savedIds = new Set(fakeDb.rows("qrPreset").map((row) => row.id));
    for (const theme of themes) {
      expect(savedIds.has(theme.themeId)).toBe(false);
      expect(theme.themeId).toBe(theme.id);
    }
  });
});

describe("publishTheme", () => {
  beforeEach(() => {
    fakeDb.seed("qrPreset", [
      savedTheme("t_new", "u_ana", {
        fgColor: "#000000",
        bgColor: "#ffffff",
        level: "M",
      }),
      savedTheme("t_faint", "u_ana", {
        fgColor: "#C8C8C8",
        bgColor: "#ffffff",
        eyeColor: "#C8C8C8",
        dotColor: "#C8C8C8",
      }),
    ]);
  });

  it("needs the CC0 licence", async () => {
    const result = await publishTheme("t_new", []);
    expect(result).toEqual({
      success: false,
      error: expect.objectContaining({ code: "LICENSE_REQUIRED" }),
    });
    expect(fakeDb.find("communityTheme", { themeId: "t_new" })).toBeFalsy();
  });

  it("refuses a design that doesn't scan Great", async () => {
    const result = await publishTheme("t_faint", [], { acceptLicense: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("SCAN_GATE");
      expect(result.error.message).toMatch(/scan Great/);
    }
    expect(fakeDb.find("communityTheme", { themeId: "t_faint" })).toBeFalsy();
  });

  it("publishes a design that scans Great, with allowed tags only", async () => {
    const result = await publishTheme("t_new", ["minimal", "made-up"], {
      acceptLicense: true,
    });
    expect(result).toEqual({ success: true, data: expect.anything() });
    const row = fakeDb.find("communityTheme", { themeId: "t_new" });
    expect(row?.userId).toBe("u_ana");
    expect(fakeDb.rows("communityThemeTag").map((t) => t.tag)).toEqual([
      "minimal",
    ]);
  });

  it("refuses someone else's theme", async () => {
    await expect(
      publishTheme("t_ban", [], { acceptLicense: true }),
    ).rejects.toThrow(/not found/i);
  });
});
