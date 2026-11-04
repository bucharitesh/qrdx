// Read-only roles (viewer, billing) in the area sidebar: the rows that only
// create are left out, every link to read something stays.
import { describe, expect, it } from "vitest";
import { type NavArea, navAreas } from "@/components/app-shell/nav-areas";

const labels = (area: NavArea) =>
  area.groups.flatMap((group) =>
    group.rows.map((row) =>
      row.kind === "link"
        ? row.item.label
        : row.kind === "area"
          ? `${row.label} ›`
          : `${row.label} (action)`,
    ),
  );

describe("area sidebar for read-only roles", () => {
  it("drops Import and the page and form templates", () => {
    const editor = navAreas("acme");
    const viewer = navAreas("acme", { canWrite: false });
    expect(labels(editor.codes)).toContain("Import");
    expect(labels(viewer.codes)).toEqual(
      labels(editor.codes).filter((label) => label !== "Import"),
    );
    expect(labels(editor.pages)).toContain("Page templates (action)");
    expect(labels(viewer.pages)).toEqual(["All pages"]);
  });

  it("keeps every other area the same", () => {
    const editor = navAreas("acme");
    const viewer = navAreas("acme", { canWrite: false });
    expect(labels(viewer.dashboard)).toEqual(labels(editor.dashboard));
    expect(labels(viewer.settings)).toEqual(labels(editor.settings));
  });
});
