// Shape catalogs and shape sections open in a side panel (a bottom sheet on
// phones). The open/close/focus flow runs in a real browser in
// e2e/playground.e2e.ts ("side panels"); these cover the keyboard rules and
// the closed markup that flow relies on.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/qr-themes", () => ({ getThemes: vi.fn() }));
vi.mock("@/actions/user-settings", () => ({ getUserSettings: vi.fn() }));

import ControlSection from "@/components/editor/control-section";
import {
  gridMove,
  ShapePicker,
} from "@/components/editor/control-sections/option-tiles";
import {
  focusOnOpen,
  offsetBeyond,
  SidePanel,
} from "@/components/editor/control-sections/side-panel";

const OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  id: `shape-${index}`,
  name: `Shape ${index}`,
}));

function picker() {
  return (
    <ShapePicker
      category={() => "classic"}
      featured={OPTIONS.slice(0, 5).map((option) => option.id)}
      label="Dot shape"
      noun="dot shapes"
      onChange={() => {}}
      options={OPTIONS}
      preview={() => null}
      value="shape-0"
    />
  );
}

describe("grid keys", () => {
  it("move by one tile sideways and one row up or down", () => {
    expect(gridMove("ArrowRight", 0, 12, 5)).toBe(1);
    expect(gridMove("ArrowLeft", 3, 12, 5)).toBe(2);
    expect(gridMove("ArrowDown", 1, 12, 5)).toBe(6);
    expect(gridMove("ArrowUp", 6, 12, 5)).toBe(1);
  });

  it("jump to the ends and stop at the edges", () => {
    expect(gridMove("Home", 7, 12, 5)).toBe(0);
    expect(gridMove("End", 2, 12, 5)).toBe(11);
    expect(gridMove("ArrowDown", 9, 12, 5)).toBe(11);
    expect(gridMove("ArrowLeft", 0, 12, 5)).toBeNull();
    expect(gridMove("ArrowRight", 11, 12, 5)).toBeNull();
  });

  it("leave other keys (Enter, Space, Escape, letters) alone", () => {
    for (const key of ["Enter", " ", "Escape", "a", "Tab"]) {
      expect(gridMove(key, 2, 12, 5)).toBeNull();
    }
    expect(gridMove("ArrowRight", -1, 12, 5)).toBeNull();
  });
});

it("opens a tile's catalog beyond the whole picker row, on either side", () => {
  const row = { left: 913, right: 1213 };
  const tile = { left: 1166, right: 1213 };
  // Right side (playground): the tile ends the row, so only the clearance.
  expect(offsetBeyond("right", tile, row, 28)).toBe(28);
  // Left side (code builder): past the rest of the row, then the clearance.
  expect(offsetBeyond("left", tile, row, 28)).toBe(1166 - 913 + 28);
});

it("focuses search on open with a mouse, the panel itself on touch", () => {
  expect(focusOnOpen(true)).toBe("search");
  expect(focusOnOpen(false)).toBe("panel");
});

describe("closed markup", () => {
  it("the More tile opens a dialog panel and the catalog isn't rendered in place", () => {
    const markup = renderToStaticMarkup(picker());
    expect(markup).toMatch(
      /<button[^>]*aria-expanded="false"[^>]*aria-haspopup="dialog"[^>]*aria-label="More dot shapes"/,
    );
    expect(markup).not.toContain("Search 12 dot shapes");
  });

  it("a closed panel renders only its trigger", () => {
    const markup = renderToStaticMarkup(
      <SidePanel
        onOpenChange={() => {}}
        open={false}
        title="Eyes"
        trigger={<button type="button">Eyes</button>}
      >
        {picker()}
      </SidePanel>,
    );
    expect(markup).toMatch(
      /^<button[^>]*aria-expanded="false"[^>]*>Eyes<\/button>$/,
    );
  });

  it("a side-panel section renders its row, not its content, until opened", () => {
    const markup = renderToStaticMarkup(
      <ControlSection popover summary="Gear" title="Eyes">
        <p>Eye pickers</p>
      </ControlSection>,
    );
    expect(markup).toMatch(/<h3><button[^>]*aria-haspopup="dialog"/);
    expect(markup).toContain("Gear");
    expect(markup).not.toContain("Eye pickers");
  });

  it("an inline section still renders its content in place", () => {
    const markup = renderToStaticMarkup(
      <ControlSection summary="Circle" title="Dots">
        <p>Dot pickers</p>
      </ControlSection>,
    );
    expect(markup).toContain("Dot pickers");
    expect(markup).not.toContain('aria-haspopup="dialog"');
  });
});
