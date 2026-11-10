// The publish gate (lib/community/scan-gate.ts, the real server scorer) on
// every official frame the community seed publishes, split into shards so
// vitest spreads the hundreds of frames over its workers
// (tests/database/seed-frames-gate-*.test.ts).
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

/** Gates shard `index` (1-based) of `count` of the seeded frames. */
export function describeSeedFrameGate(index: number, count: number) {
  const frames = seed
    .buildSeedItems()
    .filter((item: { type: string }) => item.type === "frame")
    .filter((_: unknown, i: number) => i % count === index - 1);

  describe(`the seed's official frames (shard ${index} of ${count})`, () => {
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
