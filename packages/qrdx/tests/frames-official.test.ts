// The official frame catalogue (src/frames/official): the files, the
// generated modules that load them (src/frames/catalogue) and their
// metadata. Every frame's own checks (spec, colors, print parity) are in
// tests/official-frames/checks-*.test.ts and its scan checks in
// tests/official-frames/decode-*.test.ts.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import business from "../src/frames/catalogue/business";
import callToAction from "../src/frames/catalogue/call-to-action";
import events from "../src/frames/catalogue/events";
import foodDrink from "../src/frames/catalogue/food-drink";
import healthLearning from "../src/frames/catalogue/health-learning";
import holidays from "../src/frames/catalogue/holidays";
import { OFFICIAL_FRAME_INDEX } from "../src/frames/catalogue/index";
import places from "../src/frames/catalogue/places";
import seasons from "../src/frames/catalogue/seasons";
import shopping from "../src/frames/catalogue/shopping";
import { OFFICIAL_FRAME_TAGS } from "../src/frames/catalogue/tags";
import {
  frameSpecHash,
  getOfficialFrame,
  OFFICIAL_FRAME_COLLECTIONS,
  OFFICIAL_FRAME_COUNT,
  OFFICIAL_FRAME_COUNTS,
  OFFICIAL_FRAMES,
  type OfficialFrame,
} from "../src/frames/official";
import type { QRProps } from "../types";
import { compareImages, SAMPLE_PAYLOADS } from "./support/frames";
import { blocks } from "./support/official-frames";
import { renderSvg } from "./support/qr";
import { rasterizeSvg } from "./support/raster";

const MODULES: Record<string, readonly OfficialFrame[]> = {
  "call-to-action": callToAction,
  holidays,
  seasons,
  "food-drink": foodDrink,
  shopping,
  events,
  places,
  "health-learning": healthLearning,
  business,
};

describe("the official frame catalogue", () => {
  it("has one file per frame, with unique ids and names", () => {
    expect(OFFICIAL_FRAMES).toHaveLength(OFFICIAL_FRAME_COUNT);
    const files = readdirSync(join(__dirname, "../src/frames/official"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""))
      .sort();
    expect(OFFICIAL_FRAMES.map((f) => f.id).sort()).toEqual(files);
    expect(new Set(OFFICIAL_FRAMES.map((f) => f.name)).size).toBe(
      OFFICIAL_FRAMES.length
    );
    for (const frame of OFFICIAL_FRAMES) {
      expect(frame.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(getOfficialFrame("wifi-card")?.name).toBe("Wi-Fi card");
    expect(getOfficialFrame("nope")).toBeUndefined();
  });

  it("keeps the first frames where links and seeds expect them", () => {
    // OFFICIAL_FRAMES[0] has been the Wi-Fi card since the catalogue began
    expect(OFFICIAL_FRAMES[0]?.id).toBe("wifi-card");
    for (const id of ["table-tent", "review-us", "christmas", "new-year"]) {
      expect(getOfficialFrame(id)).toBeDefined();
    }
  });

  it("files every frame in one collection, seasonal ones with an occasion", () => {
    const ids = OFFICIAL_FRAME_COLLECTIONS.map((collection) => collection.id);
    let total = 0;
    for (const id of ids) {
      const frames = OFFICIAL_FRAMES.filter((f) => f.collection === id);
      expect(frames.length, id).toBeGreaterThan(0);
      expect(OFFICIAL_FRAME_COUNTS[id]).toBe(frames.length);
      total += frames.length;
    }
    expect(total).toBe(OFFICIAL_FRAMES.length);
    for (const frame of OFFICIAL_FRAMES) {
      const seasonal =
        frame.collection === "holidays" || frame.collection === "seasons";
      expect(frame.category, frame.id).toBe(seasonal ? "seasonal" : "use-case");
      if (seasonal) expect(frame.occasion, frame.id).toMatch(/^[a-z-]+$/);
      else expect(frame.occasion, frame.id).toBeUndefined();
    }
    // At least 60 holiday and season frames, from many traditions
    const seasonal = OFFICIAL_FRAMES.filter((f) => f.category === "seasonal");
    expect(seasonal.length).toBeGreaterThanOrEqual(60);
    expect(new Set(seasonal.map((f) => f.occasion)).size).toBeGreaterThan(20);
  });

  it("loads each collection on its own, in catalogue order", () => {
    for (const { id } of OFFICIAL_FRAME_COLLECTIONS) {
      expect(MODULES[id]?.map((f) => f.id)).toEqual(
        OFFICIAL_FRAMES.filter((f) => f.collection === id).map((f) => f.id)
      );
    }
  });

  it("has an index without specs that matches the frames", () => {
    expect(OFFICIAL_FRAME_INDEX).toEqual(
      OFFICIAL_FRAMES.map((frame) => ({
        id: frame.id,
        name: frame.name,
        collection: frame.collection,
        ...(frame.occasion ? { occasion: frame.occasion } : {}),
        tags: frame.tags,
        hash: frameSpecHash(frame.spec),
        ratio:
          Math.round(
            (frame.spec.artboard.width / frame.spec.artboard.height) * 1000
          ) / 1000,
      }))
    );
    expect(new Set(OFFICIAL_FRAME_INDEX.map((entry) => entry.hash)).size).toBe(
      OFFICIAL_FRAME_INDEX.length
    );
    expect(OFFICIAL_FRAME_TAGS).toEqual(
      [...new Set(OFFICIAL_FRAMES.flatMap((frame) => frame.tags))].sort()
    );
  });

  it("hashes a copied spec the same, and a changed one differently", () => {
    const wifi = getOfficialFrame("wifi-card");
    if (!wifi) throw new Error("missing wifi-card");
    const copy = JSON.parse(JSON.stringify(wifi.spec));
    expect(frameSpecHash(copy)).toBe(frameSpecHash(wifi.spec));
    // A database (jsonb) may hand the keys back in another order
    const reordered = Object.fromEntries(Object.entries(copy).reverse());
    expect(frameSpecHash(reordered as typeof copy)).toBe(
      frameSpecHash(wifi.spec)
    );
    expect(
      frameSpecHash({ ...copy, colors: { ...copy.colors, frame: "#222222" } })
    ).not.toBe(frameSpecHash(wifi.spec));
  });

  it("compares outputs closely enough to catch a missing glyph", () => {
    // Negative control for the PDF/EPS comparison in the frame checks
    const official = getOfficialFrame("wifi-card");
    if (!official) throw new Error("missing wifi-card");
    const without = {
      ...official.spec,
      shapes: official.spec.shapes.filter((shape) => shape.type !== "icon"),
    };
    const draw = (spec: typeof without) =>
      rasterizeSvg(
        renderSvg({
          value: SAMPLE_PAYLOADS.link,
          size: 256,
          level: "M",
          frame: { style: "custom", spec },
        } satisfies QRProps),
        { width: 600 }
      );
    const a = draw(official.spec);
    const b = draw(without);
    const diff = compareImages(
      blocks(a, a.width, a.height),
      blocks(b, b.width, b.height),
      64
    );
    expect(diff.differing).toBeGreaterThan(0.002);
  });

  it("is CC0, tagged and described without placeholders", () => {
    for (const frame of OFFICIAL_FRAMES) {
      expect(frame.license).toBe("CC0-1.0");
      expect(frame.description.length).toBeGreaterThan(20);
      expect(frame.tags.length, frame.id).toBeGreaterThan(0);
      expect(`${frame.name} ${frame.description}`).not.toMatch(
        /TBD|TODO|lorem|\[\[|undefined|plenty of room/i
      );
    }
  });
});
