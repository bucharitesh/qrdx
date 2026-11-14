// The issue forms in .github/ISSUE_TEMPLATE and the map that turns their
// "Area" answer into a label (.github/scripts/issue-area-labels.mjs, run by
// .github/workflows/issue-area-labels.yml). If a dropdown option changes and
// the map doesn't, new issues for that area silently lose their label.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AREA_LABELS,
  areaLabelFor,
} from "../../../../.github/scripts/issue-area-labels.mjs";

const templates = join(
  import.meta.dirname,
  "../../../../.github/ISSUE_TEMPLATE",
);

/** The options of the dropdown with `id: <id>`, read line by line. */
function dropdownOptions(file: string, id: string): string[] {
  const lines = readFileSync(join(templates, file), "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === `id: ${id}`);
  if (start === -1) throw new Error(`${file} has no field with id ${id}`);
  const options: string[] = [];
  let inOptions = false;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "options:") {
      inOptions = true;
      continue;
    }
    if (!inOptions) continue;
    const option = /^\s+- (.+)$/.exec(line);
    if (!option) break;
    options.push(option[1].trim());
  }
  return options;
}

describe("issue form area labels", () => {
  for (const file of ["bug_report.yml", "feature_request.yml"]) {
    it(`${file}: every Area option has an entry in the label map`, () => {
      const options = dropdownOptions(file, "area");
      expect(options.length).toBeGreaterThan(0);
      expect(options).toEqual(Object.keys(AREA_LABELS));
    });
  }

  it("reads the Area answer from a body written by a form", () => {
    const body = [
      "### Area",
      "",
      "CLI (@qrdx/cli)",
      "",
      "### Integration",
      "",
      "_No response_",
    ].join("\n");
    expect(areaLabelFor(body)).toBe("area: cli");
    expect(areaLabelFor(body.replaceAll("\n", "\r\n"))).toBe("area: cli");
  });

  it("adds nothing for unknown, empty or unlabeled answers", () => {
    expect(areaLabelFor("### Area\n\nSomething else or not sure")).toBeNull();
    expect(areaLabelFor("### Area\n\n_No response_")).toBeNull();
    expect(areaLabelFor("### Area\n\nmy own label")).toBeNull();
    expect(areaLabelFor("A blank issue with no form")).toBeNull();
    expect(areaLabelFor(null)).toBeNull();
  });
});
