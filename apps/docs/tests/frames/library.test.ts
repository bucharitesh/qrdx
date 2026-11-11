// The frame library in the browser (lib/frames/library.ts): nothing loads
// until asked, the index names official frames without their specs, and a
// frame's collection loads on its own.
import { frameSpecHash, getOfficialFrame, OFFICIAL_FRAMES } from "qrdx";
import { beforeEach, describe, expect, it } from "vitest";
import {
  isCollectionLoaded,
  LOADED_OFFICIAL_FRAMES,
  loadFrameCollection,
  loadFrameIndex,
  loadOfficialFrame,
  peekFrameIndex,
  peekOfficialEntryOfSpec,
  peekOfficialFrame,
  resetFrameLibraryForTests,
} from "@/lib/frames/library";
import {
  decodeStyleParam,
  encodeStyleParam,
  officialFrameIdOfStyleParam,
} from "@/lib/playground-style";

const diwali = getOfficialFrame("diwali-diya");
if (!diwali) throw new Error("missing diwali-diya");

beforeEach(() => resetFrameLibraryForTests());

describe("the frame library", () => {
  it("loads nothing until asked", () => {
    expect(peekFrameIndex()).toBeNull();
    expect(peekOfficialFrame("wifi-card")).toBeUndefined();
    expect(peekOfficialEntryOfSpec(diwali.spec)).toBeUndefined();
  });

  it("names every official frame from the index alone", async () => {
    const index = await loadFrameIndex();
    expect(index.map((entry) => entry.id)).toEqual(
      OFFICIAL_FRAMES.map((frame) => frame.id),
    );
    for (const frame of OFFICIAL_FRAMES) {
      expect(peekOfficialEntryOfSpec(frame.spec)?.id).toBe(frame.id);
    }
    // An edited spec is a custom frame
    const edited = { ...diwali.spec, colors: { frame: "#000000" } };
    expect(peekOfficialEntryOfSpec(edited)).toBeUndefined();
    // No spec was loaded for that
    expect(peekOfficialFrame("diwali-diya")).toBeUndefined();
  });

  it("loads one collection for one frame", async () => {
    const frame = await loadOfficialFrame("diwali-diya");
    expect(frame?.spec).toEqual(diwali.spec);
    expect(frameSpecHash(frame?.spec ?? diwali.spec)).toBe(
      frameSpecHash(diwali.spec),
    );
    expect(isCollectionLoaded("holidays")).toBe(true);
    expect(isCollectionLoaded("food-drink")).toBe(false);
    expect(await loadOfficialFrame("not-a-frame")).toBeUndefined();
  });

  it("loads every collection", async () => {
    const ids = new Set<string>();
    for (const collection of [
      "call-to-action",
      "holidays",
      "seasons",
      "food-drink",
      "shopping",
      "events",
      "places",
      "health-learning",
      "business",
    ] as const) {
      for (const frame of await loadFrameCollection(collection)) {
        expect(frame.collection).toBe(collection);
        ids.add(frame.id);
      }
    }
    expect(ids.size).toBe(OFFICIAL_FRAMES.length);
  });

  it("lets a link carry an official frame by id once it has loaded", async () => {
    const frame = { style: "custom" as const, spec: diwali.spec };
    // Before the index loads, the spec travels whole
    const before = encodeStyleParam({ frame });
    expect(officialFrameIdOfStyleParam(before?.value)).toBeNull();
    await loadFrameIndex();
    const encoded = encodeStyleParam({ frame });
    expect(officialFrameIdOfStyleParam(encoded?.value)).toBe("diwali-diya");
    expect(encoded?.value.length).toBeLessThan(200);
    // Decoding needs the spec: none until its collection loads
    expect(decodeStyleParam(encoded?.value)).toBeNull();
    await loadOfficialFrame("diwali-diya");
    expect(decodeStyleParam(encoded?.value)?.styles.frame).toEqual(frame);
    expect(LOADED_OFFICIAL_FRAMES.specOf("diwali-diya")).toEqual(diwali.spec);
  });
});
