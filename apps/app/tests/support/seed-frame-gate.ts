// The publish gate (lib/community/scan-gate.ts, the real server scorer) on
// the official frames the community seed publishes: the hand-made ones and
// the day's rotating sample on a normal run, every frame with
// QRDX_FULL_FRAME_SCAN=1 (packages/qrdx/scripts/official-frames/sample.mjs),
// split into shards (tests/database/seed-frames-gate-*.test.ts). Every frame
// is also checked to scan in the engine's own tests.
//
// Each frame is a test of its own, with the default per-test timeout: a
// frame takes about a second, so the time a shard takes grows with the
// library while no one frame's limit does.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const { framePreviewStyle } = await import("@/lib/community/payloads");
const { checkScanGate } = await import("@/lib/community/scan-gate");
const seed = await import(
  "../../../../packages/database/scripts/seed-community.mjs"
);
const { framePart, framePartLabel, frameScanPlan, fullFrameScan, shardOf } =
  await import("../../../../packages/qrdx/scripts/official-frames/sample.mjs");

interface SeededFrame {
  ref: string;
  slug: string;
  type: string;
  payload: { frame: Parameters<typeof framePreviewStyle>[0] };
}

/** Gates shard `index` (1-based) of `count` of the seeded frames. */
export function describeSeedFrameGate(index: number, count: number) {
  const seeded = (seed.buildSeedItems() as SeededFrame[]).filter(
    (item) => item.type === "frame",
  );
  const plan = frameScanPlan(seeded.map((item) => item.slug));
  const gated = new Set(plan.full);
  const frames: SeededFrame[] = shardOf(
    framePart(seeded.filter((item) => gated.has(item.slug))),
    index,
    count,
  );

  const label = fullFrameScan() ? "every frame" : `day ${plan.day}`;
  describe(`the seed's official frames (${label}${framePartLabel()}, shard ${index} of ${count})`, () => {
    it("has frames to gate", () => {
      expect(frames.length).toBeGreaterThan(0);
    });

    it.each(frames.map((item) => [item.ref, item] as const))(
      "%s scans Great with the publish gate",
      async (_ref, item) => {
        const gate = await checkScanGate(framePreviewStyle(item.payload.frame));
        expect(
          gate.passed,
          gate.results.map((r) => `${r.sample}=${r.score}`).join(" "),
        ).toBe(true);
      },
    );
  });
}
