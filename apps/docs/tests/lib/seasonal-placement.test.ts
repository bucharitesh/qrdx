import { describe, expect, it } from "vitest";
import { spiderGap } from "@/components/seasonal/header-chrome";
import { clearRight, widgetBoxes } from "@/components/seasonal/site-slots";

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("header spider", () => {
  // Playground header at 1440 px: logo, the nav triggers, then the actions.
  const bar = box(0, 0, 1440, 76);
  const logo = box(16, 18, 110, 40);
  const nav = [
    box(142, 20, 94, 36), // Product
    box(238, 20, 72, 36), // Tools
    box(312, 20, 116, 36), // Developers
    box(430, 20, 46, 36), // MCP
    box(478, 20, 124, 36), // Resources
    box(604, 20, 70, 36), // Pricing
    box(1236, 18, 74, 38), // GitHub stars
    box(1340, 18, 84, 38), // Sign in
  ];

  it("hangs in the first roomy gap after the logo (after Pricing)", () => {
    expect(spiderGap(bar, logo, nav)).toEqual({
      start: 674,
      end: 1236,
      roomy: true,
    });
  });

  it("does not move when an open menu's links hang below the bar", () => {
    const panel = [
      box(502, 73, 254, 76), // Blog
      box(760, 73, 254, 76), // Compare
      box(502, 154, 254, 76), // Changelog
      box(760, 154, 254, 76), // Integrations
    ];
    expect(spiderGap(bar, logo, [...nav, ...panel])).toEqual(
      spiderGap(bar, logo, nav),
    );
  });

  it("ignores empty boxes", () => {
    expect(spiderGap(bar, logo, [...nav, box(700, 20, 0, 36)])).toEqual(
      spiderGap(bar, logo, nav),
    );
  });
});

describe("corner widgets", () => {
  const W = 1440;
  const H = 900;

  it("keeps a launcher-sized widget", () => {
    const launcher = box(W - 70, H - 70, 50, 50);
    expect(widgetBoxes([launcher], W, H)).toEqual([launcher]);
  });

  it("drops a viewport-sized layer even when it is a little narrower than the window", () => {
    // Featurebase's hidden fullscreen popup iframe: 100% wide less 12 px margins.
    const popup = box(12, 0, W - 24, H);
    expect(widgetBoxes([popup], W, H)).toEqual([]);
  });

  it("drops empty and off-screen boxes", () => {
    expect(
      widgetBoxes(
        [
          box(W - 70, H - 70, 0, 0),
          box(-200, 10, 100, 100),
          box(W, 10, 50, 50),
        ],
        W,
        H,
      ),
    ).toEqual([]);
  });
});

describe("corner character", () => {
  const canvas = box(433, 137, 1007, 763); // playground preview at 1440×900
  const cat = { width: 44, height: 76 };
  const corner = box(1340, 800, 100, 100); // reserved launcher corner
  const launcher = box(1370, 830, 50, 50);

  it("stays put when nothing is in the corner", () => {
    expect(clearRight(canvas, cat, 14, [])).toBe(14);
  });

  it("moves left of the launcher by its size plus a gap", () => {
    const right = clearRight(canvas, cat, 14, [launcher, corner]);
    expect(right).toBe(1440 - 1340 + 12);
    const catRight = canvas.right - (right ?? 0);
    expect(catRight).toBeLessThanOrEqual(corner.left - 12);
    expect(catRight).toBeLessThanOrEqual(launcher.left - 12);
  });

  it("ignores widgets above the character", () => {
    expect(clearRight(canvas, cat, 14, [box(1370, 200, 50, 50)])).toBe(14);
  });

  it("gives up when the container is too narrow to clear the widget", () => {
    expect(clearRight(box(1300, 600, 120, 300), cat, 14, [corner])).toBeNull();
  });
});
