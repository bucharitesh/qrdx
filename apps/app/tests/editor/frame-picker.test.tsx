// The Frame panel shows the whole frame library at once (no row of common
// frames to expand): search with Upload SVG beside it, the group chips and
// the paged grid, opened on the current choice. The open, focus and scroll
// flow runs in a real browser in e2e/playground.e2e.ts ("side panels").

import { describe, expect, it } from "vitest";
import {
  type FrameChoice,
  FramePicker,
  openingPlace,
} from "@/components/editor/control-sections/frame-picker";
import { renderIntl } from "../support/intl";

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}` }));

// The library's order: what's coming up, the classic frames, the shaped
// codes, the official collections, the saved frames
const SECTIONS = [
  {
    id: "coming-up",
    items: [{ id: "official:xmas-1" }, ...ids("official:soon-", 43)],
  },
  {
    id: "classic",
    items: [{ id: "none" }, ...ids("ticket-", 18), { id: "template:Arrow" }],
  },
  { id: "shapes", items: ids("shape:", 3) },
  {
    id: "seasons",
    items: [...ids("official:season-", 200), { id: "official:xmas-1" }],
  },
  { id: "food", items: ids("official:food-", 120) },
];

describe("where the Frame panel opens", () => {
  it("at the top, on what's coming up, with no frame", () => {
    expect(openingPlace(SECTIONS, "none")).toBeNull();
  });

  it("in the whole library, with the tiles down to the current one mounted", () => {
    // Arrow is tile 63: past the first page of 60, so two pages mount
    expect(openingPlace(SECTIONS, "template:Arrow")).toEqual({
      filter: "all",
      count: 120,
    });
    expect(openingPlace(SECTIONS, "ticket-3")).toEqual({
      filter: "all",
      count: 60,
    });
    // A holiday frame shows in "Coming up" first
    expect(openingPlace(SECTIONS, "official:xmas-1")).toEqual({
      filter: "all",
      count: 60,
    });
  });

  it("in its own group when it's far down the library", () => {
    expect(openingPlace(SECTIONS, "official:food-70")).toEqual({
      filter: "food",
      count: 120,
    });
    expect(openingPlace(SECTIONS, "official:season-150")).toEqual({
      filter: "seasons",
      count: 180,
    });
  });

  it("nowhere special for a choice that isn't a tile", () => {
    expect(openingPlace(SECTIONS, "custom")).toBeNull();
  });
});

describe("the Frame panel's markup", () => {
  const choices: FrameChoice[] = [
    { id: "none", name: "None", frame: { style: "none" }, group: "built-in" },
    {
      id: "ticket",
      name: "Ticket",
      frame: { style: "ticket" },
      group: "built-in",
    },
    {
      id: "template:Arrow",
      name: "Arrow",
      frame: { style: "none" },
      group: "built-in",
    },
  ];
  const markup = renderIntl(
    <FramePicker
      action={<button type="button">Upload SVG</button>}
      active
      choices={choices}
      currentName="Arrow"
      onPick={() => {}}
      preview={() => null}
      value="template:Arrow"
    />,
  );

  it("shows search with the action beside it, and the tiles, straight away", () => {
    expect(markup).toMatch(
      /<input[^>]*aria-label="Search frames"[^>]*\/><\/div><button type="button">Upload SVG<\/button>/,
    );
    expect(markup).toContain('aria-label="Filter frames"');
    expect(markup).toContain('aria-label="Classic frames"');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>.*Arrow/);
  });

  it("has no row of common frames and no More or Less toggle", () => {
    expect(markup).not.toContain("Common frames");
    expect(markup).not.toContain("More frames");
    expect(markup).not.toMatch(/>Less</);
    expect(markup).not.toContain("aria-expanded");
  });
});
