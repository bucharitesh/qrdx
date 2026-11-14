// Every generated official frame is what its generator draws, and passes
// the generator's own checks: the spec schema, 4.5:1 label contrast, labels
// big enough for print, no icon used twice and no two frames alike
// (scripts/official-frames/build.mjs). The catalogue modules match the
// frame files. Nothing is written.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test as it } from "vitest";
import { make } from "../../scripts/official-frames/build.mjs";
import { ENTRIES } from "../../scripts/official-frames/catalogue.mjs";
import { writeModules } from "../../scripts/official-frames/modules.mjs";
import {
  framePart,
  frameScanPlan,
  layoutSample,
  ROTATION_DAYS,
  rotatingSample,
} from "../../scripts/official-frames/sample.mjs";
import { OFFICIAL_FRAMES } from "../../src/frames/official";
import { frameSpecSchema } from "../../types/frame-spec";

const dir = join(__dirname, "../../src/frames/official");

describe("the frame generator", () => {
  it("draws every generated frame as its file has it, with no problems", () => {
    const problems: string[] = [];
    const specs = new Map<string, string>();
    for (const entry of ENTRIES) {
      const { frame, problems: found } = make(entry, frameSpecSchema);
      for (const problem of found) problems.push(`${entry.id}: ${problem}`);
      const file = JSON.parse(
        readFileSync(join(dir, `${entry.id}.json`), "utf8")
      );
      if (JSON.stringify(file) !== JSON.stringify(frame)) {
        problems.push(`${entry.id}: the file differs from the generator`);
      }
      const json = JSON.stringify(frame.spec);
      const twin = specs.get(json);
      if (twin) problems.push(`${entry.id}: draws the same as ${twin}`);
      specs.set(json, entry.id);
    }
    expect(problems).toEqual([]);
  });

  it("keeps the catalogue modules in step with the files", () => {
    expect(writeModules({ check: true })).toEqual([]);
  });
});

describe("the scan sample", () => {
  const ids = OFFICIAL_FRAMES.map((frame) => frame.id);

  it("covers every layout and collection, a few frames a day", () => {
    const layouts = new Set(ENTRIES.map((entry) => entry.layout));
    const sample = layoutSample();
    const covered = new Set(
      ENTRIES.filter((entry) => sample.includes(entry.id)).map((e) => e.layout)
    );
    expect(covered).toEqual(layouts);
    const collections = new Set(
      ENTRIES.filter((entry) => sample.includes(entry.id)).map(
        (e) => e.collection
      )
    );
    expect(collections.size).toBe(
      new Set(OFFICIAL_FRAMES.map((frame) => frame.collection)).size
    );
  });

  it("comes round to every generated frame", () => {
    const seen = new Set<string>();
    for (let day = 0; day < ROTATION_DAYS; day++) {
      for (const id of rotatingSample(day)) seen.add(id);
    }
    expect(seen.size).toBe(ENTRIES.length);
    // About ENTRIES / ROTATION_DAYS a day
    const today = rotatingSample(20_404);
    expect(today.length).toBeGreaterThan(0);
    expect(today.length).toBeLessThan(25);
    expect(rotatingSample(20_404)).toEqual(today);
  });

  it("checks the hand-made frames in full on every run", () => {
    const plan = frameScanPlan(ids, 20_404);
    for (const id of ["wifi-card", "christmas", "new-year"]) {
      expect(plan.full).toContain(id);
    }
    expect(plan.light.every((id) => !plan.full.includes(id))).toBe(true);
  });

  it("splits the frames into parts that check each one once", () => {
    const ids = OFFICIAL_FRAMES.map((frame) => frame.id);
    const previous = process.env.QRDX_FRAME_SCAN_PART;
    try {
      const parts: string[][] = [];
      for (let part = 1; part <= 4; part++) {
        process.env.QRDX_FRAME_SCAN_PART = `${part}/4`;
        parts.push(framePart(ids));
      }
      expect(parts.flat().sort()).toEqual([...ids].sort());
      for (const part of parts) {
        expect(part.length).toBeGreaterThanOrEqual(Math.floor(ids.length / 4));
      }
      for (const bad of ["0/4", "5/4", "2", "two/4"]) {
        process.env.QRDX_FRAME_SCAN_PART = bad;
        expect(() => framePart(ids)).toThrow("QRDX_FRAME_SCAN_PART");
      }
      process.env.QRDX_FRAME_SCAN_PART = "";
      expect(framePart(ids)).toEqual(ids);
    } finally {
      if (previous === undefined) delete process.env.QRDX_FRAME_SCAN_PART;
      else process.env.QRDX_FRAME_SCAN_PART = previous;
    }
  });
});
