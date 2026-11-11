// The publish gate (lib/community/scan-gate.ts, the real server scorer) on
// the official frames the community seed publishes: the hand-made ones and
// the day's rotating sample on a normal run, every frame with
// QRDX_FULL_FRAME_SCAN=1 (packages/qrdx/scripts/official-frames/sample.mjs),
// split into shards (tests/database/seed-frames-gate-*.test.ts). Every frame
// is also checked to scan in the engine's own tests.
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
const { frameScanPlan, fullFrameScan } = await import(
  "../../../../packages/qrdx/scripts/official-frames/sample.mjs"
);

/** Gates shard `index` (1-based) of `count` of the seeded frames. */
export function describeSeedFrameGate(index: number, count: number) {
  const seeded = seed
    .buildSeedItems()
    .filter((item: { type: string }) => item.type === "frame");
  const plan = frameScanPlan(seeded.map((item: { slug: string }) => item.slug));
  const gated = new Set(plan.full);
  const frames = seeded
    .filter((item: { slug: string }) => gated.has(item.slug))
    .filter((_: unknown, i: number) => i % count === index - 1);

  const label = fullFrameScan() ? "every frame" : `day ${plan.day}`;
  describe(`the seed's official frames (${label}, shard ${index} of ${count})`, () => {
    it("scan Great with the publish gate", { timeout: 300_000 }, async () => {
      const failures: string[] = [];
      for (const item of frames) {
        const style = framePreviewStyle(
          (item.payload as { frame: Parameters<typeof framePreviewStyle>[0] })
            .frame,
        );
        const gate = await checkScanGate(style);
        if (!gate.passed) {
          failures.push(
            `${item.ref}: ${gate.results.map((r) => `${r.sample}=${r.score}`).join(" ")}`,
          );
        }
      }
      expect(frames.length).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    });
  });
}
