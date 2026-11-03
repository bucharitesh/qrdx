// The official seed (packages/database/scripts/seed-community.mjs): every
// seeded item is valid for the app (payload schemas, tag vocabularies), the
// frames are exactly the engine's official catalogue, every seeded design
// scans Great with the publish gate (the real server scorer), and the
// script runs end to end against the fake Postgres client. Nothing
// connects to a database.
import { OFFICIAL_FRAMES } from "qrdx";
import { beforeEach, describe, expect, it } from "vitest";
import {
  collectionPayloadSchema,
  FRAME_TAGS,
  framePayloadSchema,
  framePreviewStyle,
  themePayloadSchema,
} from "@/lib/community/payloads";
import { checkScanGate } from "@/lib/community/scan-gate";
import { COMMUNITY_THEME_TAGS } from "@/lib/constants";
import * as backfill from "../../../../packages/database/scripts/backfill-community.mjs";
import * as seed from "../../../../packages/database/scripts/seed-community.mjs";
import { FakeCommunityPg } from "../support/fake-pg-community";

const NOW = new Date("2026-11-03T12:00:00Z");
const items = seed.buildSeedItems();
const byType = (type: string) => items.filter((item) => item.type === type);

describe("the seed's items", () => {
  it("publishes the engine's 24 official frames, 10 themes and 8 collections", () => {
    expect(byType("frame").map((item) => item.slug)).toEqual(
      OFFICIAL_FRAMES.map((frame) => frame.id),
    );
    expect(byType("theme")).toHaveLength(10);
    expect(byType("collection")).toHaveLength(8);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
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

  it("scans Great with the publish gate, every frame and theme", {
    timeout: 240_000,
  }, async () => {
    const failures: string[] = [];
    for (const item of items) {
      if (item.type === "collection") continue;
      const style =
        item.type === "frame"
          ? framePreviewStyle(
              (
                item.payload as {
                  frame: Parameters<typeof framePreviewStyle>[0];
                }
              ).frame,
            )
          : (item.payload as { style: Record<string, unknown> }).style;
      const gate = await checkScanGate(style as never);
      if (!gate.passed) {
        failures.push(
          `${item.ref}: ${gate.results.map((r) => `${r.sample}=${r.score}`).join(" ")}`,
        );
      }
    }
    expect(failures).toEqual([]);
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
      /Planned: 24 frame\(s\), 10 theme\(s\), 8 collection\(s\), 0 existing theme\(s\) marked official/,
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
    expect(seeded).toHaveLength(42);
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
    expect(pg.rows("community_item_version")).toHaveLength(42);

    lines.length = 0;
    await seed.run({ client: pg, argv: [], log, save, now: NOW });
    expect(lines.join("\n")).toMatch(/Nothing to do/);
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
