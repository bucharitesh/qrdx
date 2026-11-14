// The community backfill (packages/database/scripts/backfill-community.mjs)
// end to end against a fake Postgres client that runs the script's own SQL
// on tables held in memory (tests/support/fake-pg-community.ts). Nothing
// connects to a database. Also keeps the script's copy of the rules (theme
// payloads, hashes, slugs, logo icons, style keys) equal to the app's.
import { beforeEach, describe, expect, it } from "vitest";
import {
  stableStringify,
  themePayloadFromStyle,
} from "@/lib/community/payloads";
import { presetLogoIcon } from "@/lib/community/public-style";
import { itemSlug, payloadHash } from "@/lib/community/publish";
import { logoIconDataUrl } from "@/lib/qr-design/logo";
import { LOGO_ICON_IDS } from "@/lib/qr-design/style";
import { themeStylePropsSchema } from "@/types/theme";
import * as backfill from "../../../../packages/database/scripts/backfill-community.mjs";
import { FakeCommunityPg } from "../support/fake-pg-community";

const NOW = new Date("2026-11-03T12:00:00Z");
const UPLOAD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg";

describe("the script's rules match the app's", () => {
  const styles = [
    { fgColor: "#111111", showLogo: true, customLogo: UPLOAD },
    {
      fgColor: "#111111",
      showLogo: true,
      customLogo: logoIconDataUrl("phone"),
    },
    { bgColor: "#ffffff", art: { mode: "logo" }, unknownKey: 1 },
    { showLogo: true },
    {},
  ];

  it("builds the same theme payload and hash", () => {
    for (const style of styles) {
      const app = themePayloadFromStyle(style as never);
      const script = backfill.themePayload(style);
      expect(script.payload).toEqual(app?.payload);
      expect(script.removed).toEqual(app?.removed);
      expect(backfill.payloadHash(script.payload)).toBe(
        payloadHash(app?.payload),
      );
      expect(backfill.stableStringify(script.payload)).toBe(
        stableStringify(app?.payload),
      );
    }
  });

  it("reads quick icons the same way, from the same list", () => {
    expect(backfill.LOGO_ICON_IDS).toEqual([...LOGO_ICON_IDS]);
    for (const id of LOGO_ICON_IDS) {
      expect(backfill.presetLogoIcon(logoIconDataUrl(id))).toBe(
        presetLogoIcon(logoIconDataUrl(id)),
      );
    }
    expect(backfill.presetLogoIcon(UPLOAD)).toBeNull();
  });

  it("keeps the theme style keys and slugs equal", () => {
    expect([...backfill.THEME_STYLE_KEYS].sort()).toEqual(
      Object.keys(themeStylePropsSchema.shape).sort(),
    );
    for (const name of ["Ocean Breeze", "Café № 5", "", "!!!"]) {
      expect(backfill.itemSlug(name, "ci_x", "theme")).toBe(
        itemSlug(name, "ci_x", "theme"),
      );
    }
  });
});

function seedGallery(pg: FakeCommunityPg) {
  pg.seed("user", [
    {
      id: "u_ana",
      name: "Ana Ruiz",
      email: "ana@example.com",
      image: "https://example.com/a.png",
    },
    { id: "u_leo", name: "Leo", email: "leo@example.com", image: null },
    { id: "u_team", name: "QRdx", email: "Team@qrdx.dev", image: null },
  ]);
  pg.seed("organization", [{ id: "org_qrdx", slug: "qrdx" }]);
  pg.seed("qr_preset", [
    {
      id: "t_ana",
      name: "Sunset",
      style: { fgColor: "#222222", showLogo: true, customLogo: UPLOAD },
    },
    {
      id: "t_leo",
      name: "Mint",
      style: {
        fgColor: "#0f5e55",
        showLogo: true,
        customLogo: logoIconDataUrl("wifi"),
      },
    },
    { id: "t_team", name: "Classic", style: { fgColor: "#000000" } },
  ]);
  pg.seed("community_theme", [
    {
      id: "ct_ana",
      theme_id: "t_ana",
      user_id: "u_ana",
      published_at: new Date("2026-10-01"),
      like_count: 2,
    },
    {
      id: "ct_leo",
      theme_id: "t_leo",
      user_id: "u_leo",
      published_at: new Date("2026-10-02"),
      like_count: 0,
    },
    {
      id: "ct_team",
      theme_id: "t_team",
      user_id: "u_team",
      published_at: new Date("2026-09-01"),
      like_count: 1,
    },
  ]);
  pg.seed("community_theme_tag", [
    { community_theme_id: "ct_ana", tag: "warm" },
    { community_theme_id: "ct_ana", tag: "sunset" },
  ]);
  pg.seed("theme_like", [
    {
      user_id: "u_leo",
      theme_id: "ct_ana",
      created_at: new Date("2026-10-03"),
    },
    {
      user_id: "u_team",
      theme_id: "ct_ana",
      created_at: new Date("2026-10-04"),
    },
    {
      user_id: "u_ana",
      theme_id: "ct_team",
      created_at: new Date("2026-10-05"),
    },
  ]);
}

describe("backfill-community", () => {
  let pg: FakeCommunityPg;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const saved: Record<string, string> = {};
  const save = async (path: string, text: string) => {
    saved[path] = text;
  };

  beforeEach(() => {
    pg = new FakeCommunityPg();
    lines.length = 0;
    for (const key of Object.keys(saved)) delete saved[key];
    seedGallery(pg);
  });

  it("dry-runs by default and writes nothing", async () => {
    const code = await backfill.run({
      client: pg,
      argv: [],
      log,
      save,
      now: NOW,
    });
    expect(code).toBe(0);
    expect(pg.rows("community_item")).toHaveLength(0);
    expect(lines.join("\n")).toMatch(
      /Planned: 3 profile\(s\), 3 item\(s\), 2 tag\(s\), 3 like\(s\)/,
    );
    expect(pg.log.at(-1)).toBe("ROLLBACK");
  });

  it("refuses --apply without a backup", async () => {
    await expect(
      backfill.run({ client: pg, argv: ["--apply"], log, save }),
    ).rejects.toThrow(/--backup/);
  });

  it("copies every published theme in one transaction, cleaned", async () => {
    const code = await backfill.run({
      client: pg,
      argv: ["--apply", "--backup", "b.json"],
      log,
      save,
      now: NOW,
    });
    expect(code).toBe(0);
    expect(pg.log.at(-1)).toBe("COMMIT");
    const items = pg.rows("community_item");
    expect(items).toHaveLength(3);

    const ana = items.find((i) => i.legacy_community_theme_id === "ct_ana");
    expect(ana).toMatchObject({
      type: "theme",
      status: "published",
      license: "CC0-1.0",
      is_official: false,
      source_id: "t_ana",
      like_count: 2,
      payload: { style: { fgColor: "#222222", showLogo: false } },
    });
    expect(JSON.stringify(items)).not.toContain("base64");
    const leo = items.find((i) => i.legacy_community_theme_id === "ct_leo");
    expect(leo?.payload).toEqual({
      style: { fgColor: "#0f5e55", showLogo: true },
      logoIcon: "wifi",
    });

    const official = items.find(
      (i) => i.legacy_community_theme_id === "ct_team",
    );
    expect(official).toMatchObject({
      is_official: true,
      profile_id: backfill.OFFICIAL_PROFILE_ID,
    });
    const profiles = pg.rows("community_profile");
    expect(profiles).toContainEqual(
      expect.objectContaining({
        id: backfill.OFFICIAL_PROFILE_ID,
        kind: "official",
        handle: "qrdx",
        user_id: "u_team",
        workspace_id: "org_qrdx",
      }),
    );
    const people = profiles.filter((p) => p.kind === "person");
    expect(people.map((p) => p.handle)).toEqual([null, null]);
    expect(people.find((p) => p.user_id === "u_ana")).toMatchObject({
      display_name: "Ana Ruiz",
      avatar_url: "https://example.com/a.png",
    });

    expect(pg.rows("community_item_version")).toHaveLength(3);
    expect(
      pg
        .rows("community_item_tag")
        .map((t) => t.tag)
        .sort(),
    ).toEqual(["sunset", "warm"]);
    expect(pg.rows("community_like")).toHaveLength(3);
    expect(JSON.parse(saved["b.json"] as string)).toMatchObject({
      kind: "qrdx-backfill-community-backup",
      insertedItems: expect.arrayContaining([ana?.id]),
    });
    // The old tables are only read.
    expect(pg.rows("community_theme")).toHaveLength(3);
  });

  it("plans nothing the second time, and copies themes published in between", async () => {
    const argv = ["--apply", "--backup", "b.json"];
    await backfill.run({ client: pg, argv, log, save, now: NOW });
    lines.length = 0;
    await backfill.run({ client: pg, argv: [], log, save, now: NOW });
    expect(lines.join("\n")).toMatch(/Nothing to do/);

    pg.seed("qr_preset", [{ id: "t_new", name: "New", style: {} }]);
    pg.seed("community_theme", [
      {
        id: "ct_new",
        theme_id: "t_new",
        user_id: "u_ana",
        published_at: new Date("2026-11-02"),
        like_count: 0,
      },
    ]);
    await backfill.run({
      client: pg,
      argv: ["--apply", "--backup", "c.json"],
      log,
      save,
      now: NOW,
    });
    expect(pg.rows("community_item")).toHaveLength(4);
    // Ana's profile is reused, not duplicated.
    expect(
      pg.rows("community_profile").filter((p) => p.user_id === "u_ana"),
    ).toHaveLength(1);
  });

  it("marks an item removed when its creator unpublished it before the switch", async () => {
    await backfill.run({
      client: pg,
      argv: ["--apply", "--backup", "b.json"],
      log,
      save,
      now: NOW,
    });
    pg.tables.community_theme = pg
      .rows("community_theme")
      .filter((r) => r.id !== "ct_leo");
    await backfill.run({
      client: pg,
      argv: ["--apply", "--backup", "c.json"],
      log,
      save,
      now: NOW,
    });
    expect(
      pg
        .rows("community_item")
        .find((i) => i.legacy_community_theme_id === "ct_leo"),
    ).toMatchObject({ status: "removed" });
  });

  it("uses a profile the person made in the app meanwhile", async () => {
    pg.seed("community_profile", [
      { id: "cp_made_in_app", kind: "person", user_id: "u_leo", handle: "leo" },
    ]);
    await backfill.run({
      client: pg,
      argv: ["--apply", "--backup", "b.json"],
      log,
      save,
      now: NOW,
    });
    expect(
      pg
        .rows("community_item")
        .find((i) => i.legacy_community_theme_id === "ct_leo"),
    ).toMatchObject({ profile_id: "cp_made_in_app" });
  });

  it("rolls back when a count is wrong", async () => {
    pg.loseInserts = "community_like";
    const code = await backfill.run({
      client: pg,
      argv: ["--apply", "--backup", "b.json"],
      log,
      save,
      now: NOW,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/check failed: community_like: 0 of 3/);
    expect(pg.rows("community_item")).toHaveLength(0);
    expect(pg.rows("community_profile")).toHaveLength(0);
  });

  it("rolls back on an error midway", async () => {
    pg.failOn = backfill.SQL.insertTag;
    await expect(
      backfill.run({
        client: pg,
        argv: ["--apply", "--backup", "b.json"],
        log,
        save,
        now: NOW,
      }),
    ).rejects.toThrow("injected failure");
    expect(pg.rows("community_item")).toHaveLength(0);
  });
});
