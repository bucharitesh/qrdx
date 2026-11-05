// The official seed (packages/database/scripts/seed-community.mjs): every
// seeded item is valid for the app (payload schemas, tag vocabularies), the
// frames are exactly the engine's official catalogue, the built-in themes
// are their presets as a publish stores them (and the generated file is
// current), every seeded design scans Great with the publish gate (the real
// server scorer), and the script runs end to end against the fake Postgres
// client. Nothing connects to a database.
import { OFFICIAL_FRAMES } from "qrdx";
import { beforeEach, describe, expect, it } from "vitest";
import {
  collectionPayloadSchema,
  FRAME_TAGS,
  framePayloadSchema,
  framePreviewStyle,
  type ThemePayload,
  themePayloadFromStyle,
  themePayloadSchema,
} from "@/lib/community/payloads";
import { toPublicStyle } from "@/lib/community/public-style-server";
import { cleanDetails, payloadHash } from "@/lib/community/publish";
import { checkScanGate } from "@/lib/community/scan-gate";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import { defaultPresets } from "@/utils/qr-presets";
import * as backfill from "../../../../packages/database/scripts/backfill-community.mjs";
import * as seed from "../../../../packages/database/scripts/seed-community.mjs";
import {
  buildPresetSeedThemes,
  PRESET_THEME_DESCRIPTIONS,
} from "../../scripts/community-seed/preset-themes";
import { FakeCommunityPg } from "../support/fake-pg-community";

const NOW = new Date("2026-11-03T12:00:00Z");
const items = seed.buildSeedItems();
const byType = (type: string) => items.filter((item) => item.type === type);
const presetIds = new Set(Object.keys(PRESET_THEME_DESCRIPTIONS));
const isPreset = (item: (typeof items)[number]) =>
  item.type === "theme" && item.facets?.preset !== undefined;
/** The design a theme or frame item is shown (and gated) as. */
const shownStyle = (item: (typeof items)[number]) =>
  item.type === "frame"
    ? framePreviewStyle(
        (item.payload as { frame: Parameters<typeof framePreviewStyle>[0] })
          .frame,
      )
    : toPublicStyle(
        (item.payload as ThemePayload).style,
        (item.payload as ThemePayload).logoIcon,
      );

describe("the seed's items", () => {
  it("publishes the engine's 24 official frames, 51 themes and 8 collections", () => {
    expect(byType("frame").map((item) => item.slug)).toEqual(
      OFFICIAL_FRAMES.map((frame) => frame.id),
    );
    expect(byType("theme")).toHaveLength(51);
    expect(byType("theme").filter(isPreset)).toHaveLength(41);
    expect(byType("collection")).toHaveLength(8);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(new Set(items.map((item) => `${item.type}:${item.slug}`)).size).toBe(
      items.length,
    );
  });

  it("never publishes the same design twice (a publish refuses it)", () => {
    const designs = items.map(
      (item) => `${item.type}:${payloadHash(item.payload)}`,
    );
    expect(new Set(designs).size).toBe(designs.length);
  });

  it("stores payloads the app accepts, with tags from its vocabularies", () => {
    for (const item of items) {
      const schema =
        item.type === "frame"
          ? framePayloadSchema
          : item.type === "theme"
            ? themePayloadSchema
            : collectionPayloadSchema;
      expect(schema.safeParse(item.payload).success, item.slug).toBe(true);
      expect(item.tags.length).toBeLessThanOrEqual(5);
      const vocabulary: readonly string[] =
        item.type === "theme" ? COMMUNITY_THEME_TAGS : FRAME_TAGS;
      for (const tag of item.tags) expect(vocabulary, item.slug).toContain(tag);
      expect(item.name.length).toBeLessThanOrEqual(60);
    }
  });

  it("lists only seeded items in its collections", () => {
    const ids = new Set(items.map((item) => item.id));
    for (const collection of byType("collection")) {
      expect(collection.entries?.length).toBeGreaterThan(1);
      for (const entry of collection.entries ?? []) {
        expect(ids.has(entry)).toBe(true);
      }
    }
  });

  const gateFailures = async (gated: typeof items) => {
    const failures: string[] = [];
    for (const item of gated) {
      const gate = await checkScanGate(shownStyle(item));
      if (!gate.passed) {
        failures.push(
          `${item.ref}: ${gate.results.map((r) => `${r.sample}=${r.score}`).join(" ")}`,
        );
      }
    }
    return failures;
  };

  it("scans Great with the publish gate, every frame and hand-made theme", {
    timeout: 240_000,
  }, async () => {
    const gated = items.filter(
      (item) => item.type !== "collection" && !isPreset(item),
    );
    expect(await gateFailures(gated)).toEqual([]);
  });

  it("scans Great with the publish gate, every built-in theme", {
    timeout: 240_000,
  }, async () => {
    expect(await gateFailures(items.filter(isPreset))).toEqual([]);
  });
});

describe("the built-in themes", () => {
  const presets = byType("theme").filter(isPreset);

  it("are the generated file, current with the presets", () => {
    expect(
      seed.PRESET_SEED.themes,
      "Run `pnpm exec tsx scripts/community-seed/generate.ts` in apps/docs",
    ).toEqual(buildPresetSeedThemes());
    expect(presets.map((item) => item.facets?.preset)).toEqual([...presetIds]);
  });

  it("store what a publish of the preset stores, nothing taken out", () => {
    for (const item of presets) {
      const id = item.facets?.preset as string;
      const preset = defaultPresets[id];
      expect(preset, id).toBeDefined();
      expect(item.id).toBe(`ci_official_theme_${id}`);
      const built = themePayloadFromStyle(preset.styles);
      expect(built?.removed, id).toEqual([]);
      expect(item.payload, id).toEqual(built?.payload);
      expect(item.name).toBe(preset.label);
      // The publish path's name, description and tag rules leave them as is
      const details = {
        name: item.name,
        description: item.description,
        tags: item.tags,
      };
      expect(cleanDetails(details, COMMUNITY_THEME_TAGS), id).toEqual(details);
      expect(item.description.length, id).toBeGreaterThan(40);
      // Tags are the preset's own words and shelf, never added ones
      const words = [...(preset.tags ?? []), preset.category ?? ""].map(
        (word) => word.replace(/\s+/g, "-"),
      );
      for (const tag of item.tags) expect(words, id).toContain(tag);
    }
  });

  it("keep the QRdx mark where the preset shows it, as a publish does", () => {
    const withLogo = presets.filter(
      (item) => (item.payload as ThemePayload).style.showLogo,
    );
    expect(withLogo.map((item) => item.slug)).toEqual(["pebble", "logotype"]);
    for (const item of withLogo) {
      const payload = item.payload as ThemePayload;
      expect(payload.logoIcon).toBeUndefined();
      expect(payload.style.customLogo).toBeUndefined();
    }
  });
});

describe("seed-community", () => {
  let pg: FakeCommunityPg;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  const save = async () => {};

  beforeEach(() => {
    pg = new FakeCommunityPg();
    lines.length = 0;
    pg.seed("user", [{ id: "u_team", name: "QRdx", email: "team@qrdx.dev" }]);
    pg.seed("organization", [{ id: "org_qrdx", slug: "qrdx" }]);
  });

  it("dry-runs by default", async () => {
    expect(await seed.run({ client: pg, argv: [], log, save, now: NOW })).toBe(
      0,
    );
    expect(pg.rows("community_item")).toHaveLength(0);
    expect(lines.join("\n")).toMatch(
      /Planned: 24 frame\(s\), 51 theme\(s\), 8 collection\(s\), 0 existing theme\(s\) marked official/,
    );
  });

  it("seeds everything as the verified @qrdx profile, then nothing the second time", async () => {
    // A theme of the official account, copied by the backfill without the profile.
    pg.seed("community_profile", [
      { id: "cp_other", kind: "person", user_id: "u_team", handle: null },
    ]);
    pg.seed("community_item", [
      {
        id: "ci_legacy",
        type: "theme",
        slug: "classic-ab12",
        profile_id: "cp_other",
        is_official: false,
        created_by: "u_team",
        legacy_community_theme_id: "ct_1",
      },
    ]);
    const argv = ["--apply", "--backup", "s.json"];
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(pg.log.at(-1)).toBe("COMMIT");

    const profile = pg
      .rows("community_profile")
      .find((p) => p.kind === "official");
    expect(profile).toMatchObject({
      id: backfill.OFFICIAL_PROFILE_ID,
      handle: "qrdx",
      user_id: "u_team",
      workspace_id: "org_qrdx",
      verified_at: NOW,
    });
    const seeded = pg
      .rows("community_item")
      .filter((i) => String(i.id).startsWith("ci_official_"));
    expect(seeded).toHaveLength(items.length);
    expect(items).toHaveLength(83);
    expect(
      seeded.every((i) => i.is_official && i.profile_id === profile?.id),
    ).toBe(true);
    expect(
      pg
        .rows("community_item")
        .find((i) => i.id === "ci_official_frame_wifi-card"),
    ).toMatchObject({
      slug: "wifi-card",
      featured_at: NOW,
      license: "CC0-1.0",
    });
    expect(
      pg.rows("community_item").find((i) => i.id === "ci_legacy"),
    ).toMatchObject({
      is_official: true,
      profile_id: backfill.OFFICIAL_PROFILE_ID,
    });
    expect(pg.rows("community_collection_entry").length).toBe(
      byType("collection").reduce(
        (sum, c) => sum + (c.entries?.length ?? 0),
        0,
      ),
    );
    expect(pg.rows("community_item_version")).toHaveLength(items.length);
    expect(
      pg
        .rows("community_item")
        .find((i) => i.id === "ci_official_theme_loveNote"),
    ).toMatchObject({
      type: "theme",
      slug: "love-note",
      name: "Love Note",
      is_official: true,
      featured_at: null,
      payload: { style: { frame: { style: "envelope", text: "Open me" } } },
    });

    lines.length = 0;
    await seed.run({ client: pg, argv: [], log, save, now: NOW });
    expect(lines.join("\n")).toMatch(/Nothing to do/);
  });

  it("skips a design that is already published, as a publish would", async () => {
    const aurora = items.find((item) => item.id === "ci_official_theme_aurora");
    pg.seed("community_item", [
      {
        id: "ci_someone",
        type: "theme",
        slug: "my-aurora-ab12",
        status: "published",
        payload_hash: payloadHash(aurora?.payload),
        profile_id: "cp_someone",
        is_official: false,
        created_by: "u_someone",
      },
    ]);
    const argv = ["--apply", "--backup", "s.json"];
    expect(await seed.run({ client: pg, argv, log, save, now: NOW })).toBe(0);
    expect(lines.join("\n")).toMatch(
      /theme aurora is already published as "my-aurora-ab12": ci_official_theme_aurora is skipped/,
    );
    const ids = pg.rows("community_item").map((i) => i.id);
    expect(ids).not.toContain("ci_official_theme_aurora");
    expect(ids).toHaveLength(items.length);
  });

  it("refuses to seed without the official account", async () => {
    pg.tables.user = [];
    await expect(
      seed.run({ client: pg, argv: [], log, save, now: NOW }),
    ).rejects.toThrow(/official account/);
    expect(pg.log.at(-1)).toBe("ROLLBACK");
  });

  it("rolls back when a count is wrong", async () => {
    pg.loseInserts = "community_collection_entry";
    expect(
      await seed.run({
        client: pg,
        argv: ["--apply", "--backup", "s.json"],
        log,
        save,
        now: NOW,
      }),
    ).toBe(1);
    expect(pg.rows("community_item")).toHaveLength(0);
  });
});
