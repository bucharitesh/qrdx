// The community data layer (lib/community/*) against in-memory tables
// (tests/support/fake-db): which tables it reads before and after
// manual-sql/0012 and the backfill, the official catalogue fallback, banned
// creators hidden everywhere, publishing frames and themes (snapshots,
// duplicates, text and spec checks, the real scan gate), likes, saves,
// copies with their use counts and plan limits, and handles. Nothing
// connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ plan: "free" as string }));

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
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlan: async () => state.plan,
  getPlanForScope: async () => state.plan,
}));

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { getOfficialFrame, OFFICIAL_FRAMES } from "qrdx";
import { CopyRefusedError, copyItemToWorkspace } from "@/lib/community/copies";
import { framePreviewStyle } from "@/lib/community/payloads";
import {
  ProfileInputError,
  saveCommunityProfile,
} from "@/lib/community/profiles";
import {
  PublishError,
  publishFrame,
  publishSavedTheme,
  unpublishItem,
} from "@/lib/community/publish";
import {
  getItem,
  getProfileByHandle,
  listFrames,
  listItems,
  savedFrames,
  themeItemsFeed,
} from "@/lib/community/queries";
import {
  ItemNotFoundError,
  toggleItemLike,
  toggleItemSave,
} from "@/lib/community/reactions";
import {
  CommunityUnavailableError,
  isMissingSchemaError,
  probeCommunityState,
} from "@/lib/community/store";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import type { ActiveScope } from "@/lib/scope";
import { fakeDb, repoDatabase } from "../support/fake-db";

const NOW = new Date("2026-11-03T10:00:00Z");
const fakeDatabase = repoDatabase.database as {
  select: (...args: unknown[]) => unknown;
  batch: (...args: unknown[]) => Promise<unknown>;
};
const missingTable = () =>
  Object.assign(new Error('relation "community_item" does not exist'), {
    code: "42P01",
  });
const wifi = getOfficialFrame("wifi-card");
if (!wifi) throw new Error("the engine has no wifi-card frame");
const WIFI_FRAME = { style: "custom" as const, spec: wifi.spec };

function person(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `${id.replace("u_", "")} person`,
    email: `${id}@example.com`,
    image: `https://example.com/${id}.png`,
    banned: false,
    banExpires: null,
    ...extra,
  };
}

function profile(id: string, userId: string | null, extra = {}) {
  return {
    id,
    kind: "person",
    userId,
    handle: null,
    displayName: `${id} name`,
    avatarUrl: null,
    verifiedAt: null,
    status: "active",
    ...extra,
  };
}

let seq = 0;
function item(
  type: string,
  profileId: string,
  payload: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  seq += 1;
  return {
    id: `ci_${seq}`,
    type,
    slug: `${type}-${seq}`,
    profileId,
    createdBy: null,
    name: `${type} ${seq}`,
    description: null,
    status: "published",
    license: "CC0-1.0",
    currentVersion: 1,
    payload,
    payloadHash: `hash-${seq}`,
    facets: null,
    scanScore: null,
    isOfficial: false,
    featuredAt: null,
    remixedFromLabel: null,
    sourceKind: null,
    sourceId: null,
    likeCount: 0,
    saveCount: 0,
    useCount: 0,
    publishedAt: new Date(NOW.getTime() - seq * 1000),
    ...extra,
  };
}

const scopeOf = (userId: string): ActiveScope => ({
  userId,
  organizationId: ownWorkspaceId(userId),
  role: "owner",
});

beforeEach(() => {
  vi.restoreAllMocks();
  fakeDb.resetAll();
  seq = 0;
  state.plan = "free";
  fakeDb.unique("communityProfile", "handle");
  fakeDb.unique("communityProfile", "userId", "kind");
  fakeDb.unique("communityItem", "type", "slug");
  fakeDb.unique("communityItemVersion", "itemId", "version");
  fakeDb.unique("communityItemTag", "itemId", "tag");
  fakeDb.unique("communityLike", "userId", "itemId");
  fakeDb.unique("communitySave", "userId", "itemId");
  fakeDb.unique("communityUse", "itemId", "userId", "kind", "day");
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
  fakeDb.seed("user", [
    person("u_ana"),
    person("u_ban", { banned: true }),
    person("u_was", {
      banned: true,
      banExpires: new Date("2026-01-01T00:00:00Z"),
    }),
    person("u_team", { email: "team@qrdx.dev" }),
  ]);
});

describe("which tables the community reads", () => {
  it("reads community_theme until 0012 exists", async () => {
    vi.spyOn(fakeDatabase, "batch").mockRejectedValueOnce(missingTable());
    expect(await probeCommunityState()).toEqual({
      tables: false,
      themes: "legacy",
    });
  });

  it("keeps reading community_theme until the backfill copied the themes", async () => {
    fakeDb.seed("communityTheme", [
      { id: "ct_1", themeId: "t_1", userId: "u_ana", likeCount: 0 },
    ]);
    expect(await probeCommunityState()).toEqual({
      tables: true,
      themes: "legacy",
    });
  });

  it("switches to community_item once themes are there (or none ever existed)", async () => {
    expect((await probeCommunityState()).themes).toBe("items");
    fakeDb.seed("communityProfile", [profile("cp_ana", "u_ana")]);
    fakeDb.seed("communityTheme", [
      { id: "ct_1", themeId: "t_1", userId: "u_ana", likeCount: 0 },
    ]);
    fakeDb.seed("communityItem", [item("theme", "cp_ana", { style: {} })]);
    expect((await probeCommunityState()).themes).toBe("items");
  });

  it("lets other database errors through", async () => {
    vi.spyOn(fakeDatabase, "batch").mockRejectedValueOnce(new Error("boom"));
    await expect(probeCommunityState()).rejects.toThrow("boom");
    expect(isMissingSchemaError({ cause: { code: "42703" } })).toBe(true);
    expect(isMissingSchemaError(new Error("other"))).toBe(false);
  });
});

describe("reading items", () => {
  it("shows the engine's official frames before 0012 exists", async () => {
    vi.spyOn(fakeDatabase, "select").mockImplementationOnce(() => {
      throw missingTable();
    });
    const frames = await listFrames();
    expect(frames.map((card) => card.slug)).toEqual(
      OFFICIAL_FRAMES.map((frame) => frame.id),
    );
    expect(frames.every((card) => card.isOfficial && card.id === null)).toBe(
      true,
    );
  });

  it("uses the seeded official frame and keeps the rest from the catalogue", async () => {
    fakeDb.seed("communityProfile", [
      profile("cp_official_qrdx", "u_team", {
        kind: "official",
        handle: "qrdx",
        displayName: "QRdx",
      }),
      profile("cp_ana", "u_ana"),
    ]);
    fakeDb.seed("communityItem", [
      item(
        "frame",
        "cp_official_qrdx",
        { frame: WIFI_FRAME },
        {
          id: "ci_official_frame_wifi-card",
          slug: "wifi-card",
          isOfficial: true,
        },
      ),
      item(
        "frame",
        "cp_ana",
        { frame: WIFI_FRAME },
        { slug: "ana-frame-ab12" },
      ),
    ]);
    const frames = await listFrames();
    expect(frames).toHaveLength(OFFICIAL_FRAMES.length + 1);
    expect(frames[0]).toMatchObject({
      id: "ci_official_frame_wifi-card",
      creator: { handle: "qrdx", official: true, verified: true },
    });
    expect(frames.filter((card) => card.slug === "wifi-card")).toHaveLength(1);
    expect(frames.at(-1)?.slug).toBe("ana-frame-ab12");
    expect((await listFrames({ official: false })).map((c) => c.slug)).toEqual([
      "ana-frame-ab12",
    ]);
  });

  it("keeps members' frames when the whole official library is seeded", async () => {
    fakeDb.seed("communityProfile", [
      profile("cp_official_qrdx", "u_team", {
        kind: "official",
        handle: "qrdx",
        displayName: "QRdx",
      }),
      profile("cp_ana", "u_ana"),
    ]);
    fakeDb.seed("communityItem", [
      ...OFFICIAL_FRAMES.map((frame) =>
        item(
          "frame",
          "cp_official_qrdx",
          { frame: { style: "custom", spec: frame.spec } },
          {
            id: `ci_official_frame_${frame.id}`,
            slug: frame.id,
            isOfficial: true,
          },
        ),
      ),
      item(
        "frame",
        "cp_ana",
        { frame: WIFI_FRAME },
        { slug: "ana-frame-ab12" },
      ),
    ]);
    const frames = await listFrames();
    expect(frames).toHaveLength(OFFICIAL_FRAMES.length + 1);
    expect(
      frames.every((card) => card.isOfficial || card.slug === "ana-frame-ab12"),
    ).toBe(true);
    expect(frames.filter((card) => card.id === null)).toEqual([]);
    expect(frames.at(-1)?.slug).toBe("ana-frame-ab12");
  });

  it("falls back to the catalogue for an official frame page", async () => {
    const detail = await getItem("frame", "wifi-card", null);
    expect(detail).toMatchObject({
      id: null,
      isOfficial: true,
      apply: { frame: WIFI_FRAME },
      contentTypes: ["wifi"],
    });
    expect(await getItem("frame", "no-such-frame", null)).toBeNull();
  });

  it("hides banned creators everywhere, and removed items", async () => {
    fakeDb.seed("communityProfile", [
      profile("cp_ana", "u_ana", { handle: "ana" }),
      profile("cp_ban", "u_ban", { handle: "banned" }),
      profile("cp_was", "u_was", { handle: "was" }),
    ]);
    fakeDb.seed("communityItem", [
      item("theme", "cp_ana", { style: {} }, { slug: "ana-theme" }),
      item("theme", "cp_ban", { style: {} }, { slug: "ban-theme" }),
      item("theme", "cp_was", { style: {} }, { slug: "was-theme" }),
      item(
        "theme",
        "cp_ana",
        { style: {} },
        { slug: "gone", status: "removed" },
      ),
    ]);
    const slugs = (await listItems({ type: "theme" })).map((c) => c.slug);
    expect(slugs.sort()).toEqual(["ana-theme", "was-theme"]);
    expect(await getItem("theme", "ban-theme", null)).toBeNull();
    expect(await getItem("theme", "gone", null)).toBeNull();
    expect(await getProfileByHandle("banned")).toBeNull();
    expect((await getProfileByHandle("ana"))?.itemCount).toBe(1);
    const feed = await themeItemsFeed({
      sort: "newest",
      cursor: null,
      limit: 20,
      filter: "all",
      tags: [],
      userId: null,
      timeRange: "all",
    });
    expect(feed.themes.map((t) => t.slug).sort()).toEqual([
      "ana-theme",
      "was-theme",
    ]);
  });

  it("draws quick logo icons again and never returns a stored image", async () => {
    fakeDb.seed("communityProfile", [profile("cp_ana", "u_ana")]);
    fakeDb.seed("communityItem", [
      item(
        "theme",
        "cp_ana",
        {
          style: {
            fgColor: "#111111",
            showLogo: true,
            customLogo: "data:image/png;base64,AAAA",
          },
          logoIcon: "wifi",
        },
        { slug: "icon-theme" },
      ),
    ]);
    const detail = await getItem("theme", "icon-theme", null);
    expect(detail?.apply.customLogo).toBe(logoIconDataUrl("wifi"));
    expect(JSON.stringify(detail)).not.toContain("base64,AAAA");
  });
});

describe("publishing", () => {
  it("publishes a frame as version 1, under a new profile with no handle", async () => {
    const result = await publishFrame({
      userId: "u_ana",
      frame: { ...WIFI_FRAME, text: "Join our Wi-Fi" },
      details: {
        name: "Café Wi-Fi card",
        description: "For tables.",
        tags: ["wifi", "cafe", "not-a-tag"],
      },
    });
    expect(result.slug).toMatch(
      /^caf-wi-fi-card-[a-z0-9]{4}$|^cafe-wi-fi-card-[a-z0-9]{4}$/,
    );
    const row = fakeDb.find("communityItem", { id: result.id });
    expect(row).toMatchObject({
      type: "frame",
      status: "published",
      license: "CC0-1.0",
      currentVersion: 1,
      isOfficial: false,
      createdBy: "u_ana",
    });
    expect(Number(row?.scanScore)).toBeGreaterThanOrEqual(85);
    expect(fakeDb.rows("communityItemVersion")).toHaveLength(1);
    expect(
      fakeDb
        .rows("communityItemTag")
        .map((t) => t.tag)
        .sort(),
    ).toEqual(["cafe", "wifi"]);
    expect(fakeDb.rows("communityProfile")).toEqual([
      expect.objectContaining({
        kind: "person",
        userId: "u_ana",
        handle: null,
        displayName: "ana person",
      }),
    ]);
  });

  it("refuses a duplicate, an invalid spec and text with contact details", async () => {
    await publishFrame({
      userId: "u_ana",
      frame: WIFI_FRAME,
      details: { name: "First" },
    });
    await expect(
      publishFrame({
        userId: "u_ana",
        frame: WIFI_FRAME,
        details: { name: "Again" },
      }),
    ).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" });

    const tiny = {
      ...WIFI_FRAME,
      spec: { ...WIFI_FRAME.spec, qr: { ...WIFI_FRAME.spec.qr, size: 100 } },
    };
    await expect(
      publishFrame({ userId: "u_ana", frame: tiny, details: { name: "Tiny" } }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      publishFrame({
        userId: "u_ana",
        frame: { ...WIFI_FRAME, text: "Call +1 415 555 0132" },
        details: { name: "Call me" },
      }),
    ).rejects.toThrow(PublishError);
    await expect(
      publishFrame({
        userId: "u_ana",
        frame: { ...WIFI_FRAME, text: "Hi" },
        details: { name: "Visit www.example.com" },
      }),
    ).rejects.toThrow(/links/);
  });

  it("publishes a saved theme as a snapshot without its uploaded logo", async () => {
    const style = {
      fgColor: "#000000",
      bgColor: "#ffffff",
      level: "Q" as const,
      margin: 4,
      showLogo: true,
      customLogo: "data:image/png;base64,SECRET",
    };
    const result = await publishSavedTheme({
      userId: "u_ana",
      theme: { id: "t_1", name: "Plain", style },
      tags: ["minimal"],
    });
    const row = fakeDb.find("communityItem", { id: result.id });
    expect(row?.payload).toEqual({
      style: {
        fgColor: "#000000",
        bgColor: "#ffffff",
        level: "Q",
        margin: 4,
        showLogo: false,
      },
    });
    expect(row).toMatchObject({ sourceKind: "qr_preset", sourceId: "t_1" });
    style.fgColor = "#ff0000";
    const stored = fakeDb.find("communityItem", { id: result.id });
    expect(stored?.payload).toMatchObject({ style: { fgColor: "#000000" } });
  });

  it("refuses a theme that doesn't scan Great", async () => {
    await expect(
      publishSavedTheme({
        userId: "u_ana",
        theme: {
          id: "t_faint",
          name: "Faint",
          style: {
            fgColor: "#C8C8C8",
            eyeColor: "#C8C8C8",
            dotColor: "#C8C8C8",
            bgColor: "#ffffff",
          },
        },
        tags: [],
      }),
    ).rejects.toMatchObject({ code: "SCAN_GATE" });
    expect(fakeDb.rows("communityItem")).toHaveLength(0);
  });

  it("publishes as @qrdx from the account that owns the official profile", async () => {
    fakeDb.seed("communityProfile", [
      profile("cp_official_qrdx", "u_team", {
        kind: "official",
        handle: "qrdx",
        displayName: "QRdx",
      }),
    ]);
    const result = await publishFrame({
      userId: "u_team",
      frame: WIFI_FRAME,
      details: { name: "Official card" },
    });
    expect(fakeDb.find("communityItem", { id: result.id })).toMatchObject({
      profileId: "cp_official_qrdx",
      isOfficial: true,
    });
  });

  it("lets only the creator unpublish, and hides the item at once", async () => {
    const result = await publishFrame({
      userId: "u_ana",
      frame: WIFI_FRAME,
      details: { name: "Mine" },
    });
    expect((await getItem("frame", result.slug, "u_ana"))?.isMine).toBe(true);
    expect((await getItem("frame", result.slug, "u_was"))?.isMine).toBe(false);
    expect(await unpublishItem("u_was", result.id)).toBe(false);
    expect(await unpublishItem("u_ana", result.id)).toBe(true);
    expect(fakeDb.find("communityItem", { id: result.id })).toMatchObject({
      status: "removed",
      removedReason: "creator",
    });
    expect(await getItem("frame", result.slug, null)).toBeNull();
    expect(await unpublishItem("u_ana", result.id)).toBe(false);
  });

  it("says when the tables aren't there yet", async () => {
    vi.spyOn(fakeDatabase, "select").mockImplementationOnce(() => {
      throw missingTable();
    });
    await expect(
      publishFrame({
        userId: "u_ana",
        frame: WIFI_FRAME,
        details: { name: "X" },
      }),
    ).rejects.toThrow(CommunityUnavailableError);
  });
});

describe("likes, saves and copies", () => {
  beforeEach(() => {
    fakeDb.seed("communityProfile", [profile("cp_ana", "u_ana")]);
    fakeDb.seed("communityItem", [
      item(
        "frame",
        "cp_ana",
        { frame: WIFI_FRAME },
        { id: "ci_f", slug: "card-ab12", currentVersion: 2 },
      ),
      item(
        "frame",
        "cp_ana",
        { frame: WIFI_FRAME },
        { id: "ci_x", slug: "gone", status: "removed" },
      ),
    ]);
  });

  it("toggles likes and saves with their counts", async () => {
    expect(await toggleItemLike("u_was", "ci_f")).toEqual({
      liked: true,
      likeCount: 1,
    });
    expect(await toggleItemLike("u_was", "ci_f")).toEqual({
      liked: false,
      likeCount: 0,
    });
    expect(await toggleItemSave("u_was", "ci_f")).toEqual({ saved: true });
    expect(fakeDb.find("communityItem", { id: "ci_f" })?.saveCount).toBe(1);
    expect((await savedFrames("u_was")).map((f) => f.id)).toEqual(["ci_f"]);
    expect(await toggleItemSave("u_was", "ci_f")).toEqual({ saved: false });
    await expect(toggleItemLike("u_was", "ci_x")).rejects.toThrow(
      ItemNotFoundError,
    );
  });

  it("copies a frame into the workspace and counts one use a day", async () => {
    const first = await copyItemToWorkspace(scopeOf("u_was"), {
      type: "frame",
      slug: "card-ab12",
    });
    expect(first.where).toBe("own");
    const preset = fakeDb.find("qrPreset", { id: first.themeId });
    expect(preset).toMatchObject({
      userId: "u_was",
      organizationId: ownWorkspaceId("u_was"),
    });
    expect(preset?.style).toEqual(framePreviewStyle(WIFI_FRAME));
    expect(fakeDb.rows("communityUse")).toEqual([
      expect.objectContaining({
        itemId: "ci_f",
        version: 2,
        kind: "copy",
        presetId: first.themeId,
      }),
    ]);
    await copyItemToWorkspace(scopeOf("u_was"), {
      type: "frame",
      slug: "card-ab12",
    });
    expect(fakeDb.find("communityItem", { id: "ci_f" })?.useCount).toBe(1);
    expect(fakeDb.rows("qrPreset")).toHaveLength(2);
  });

  it("copies an official catalogue frame, and stops at the plan's limit", async () => {
    const copy = await copyItemToWorkspace(scopeOf("u_was"), {
      type: "frame",
      slug: "review-us",
    });
    expect(fakeDb.find("qrPreset", { id: copy.themeId })?.name).toBe(
      "Review us",
    );
    expect(fakeDb.rows("communityUse")).toHaveLength(0);

    for (let i = 0; i < 9; i += 1) {
      fakeDb.seed("qrPreset", [
        {
          id: `t_${i}`,
          userId: "u_was",
          organizationId: ownWorkspaceId("u_was"),
          name: `Theme ${i}`,
          style: {},
          isDefault: false,
        },
      ]);
    }
    await expect(
      copyItemToWorkspace(scopeOf("u_was"), {
        type: "frame",
        slug: "review-us",
      }),
    ).rejects.toMatchObject({ code: "THEME_LIMIT_REACHED" });
    await expect(
      copyItemToWorkspace(scopeOf("u_was"), { type: "frame", slug: "gone" }),
    ).rejects.toThrow(CopyRefusedError);
  });
});

describe("profiles and handles", () => {
  it("claims, refuses reserved and taken handles, and releases", async () => {
    expect(
      await saveCommunityProfile("u_ana", {
        handle: "@Ana_Ruiz",
        displayName: "Ana Ruiz",
        showPicture: false,
      }),
    ).toEqual({ handle: "ana_ruiz" });
    expect(fakeDb.find("communityProfile", { userId: "u_ana" })).toMatchObject({
      handle: "ana_ruiz",
      displayName: "Ana Ruiz",
      avatarUrl: null,
    });
    await expect(
      saveCommunityProfile("u_was", {
        handle: "ana_ruiz",
        displayName: "Was",
        showPicture: true,
      }),
    ).rejects.toThrow("That handle is taken.");
    for (const reserved of ["qrdx", "qr-dx_team", "admin", "community"]) {
      await expect(
        saveCommunityProfile("u_was", {
          handle: reserved,
          displayName: "Was",
          showPicture: true,
        }),
      ).rejects.toThrow("That handle is reserved.");
    }
    await expect(
      saveCommunityProfile("u_was", {
        handle: "ok-handle",
        displayName: "mail me at was@example.com",
        showPicture: true,
      }),
    ).rejects.toThrow(ProfileInputError);
    expect(
      await saveCommunityProfile("u_ana", {
        handle: "",
        displayName: "Ana Ruiz",
        showPicture: true,
      }),
    ).toEqual({ handle: null });
    expect(fakeDb.find("communityProfile", { userId: "u_ana" })).toMatchObject({
      handle: null,
      avatarUrl: "https://example.com/u_ana.png",
    });
  });

  it("shows @qrdx before the seed, from the catalogue", async () => {
    vi.spyOn(fakeDatabase, "select").mockImplementationOnce(() => {
      throw missingTable();
    });
    const official = await getProfileByHandle("qrdx");
    expect(official?.creator).toMatchObject({ official: true, verified: true });
    expect(official?.itemCount).toBe(OFFICIAL_FRAMES.length);
  });
});
