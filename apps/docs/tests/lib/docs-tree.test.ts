// The docs sidebar without the pages this deployment doesn't offer
// (lib/docs-tree.ts, filterPageTree): hidden pages go, and so do folders
// they leave empty.
import { isPathShown } from "@repo/availability";
import { describe, expect, it } from "vitest";
import { filterPageTree } from "@/lib/docs-tree";

describe("docs sidebar", () => {
  it("drops hidden pages and folders left empty", () => {
    const tree = filterPageTree(
      {
        name: "Docs",
        children: [
          { type: "page", name: "Intro", url: "/docs" },
          { type: "page", name: "Domains", url: "/docs/custom-domains" },
          {
            type: "folder",
            name: "Only hidden",
            children: [
              { type: "page", name: "Domains", url: "/docs/custom-domains" },
            ],
          },
          { type: "separator", name: "More" },
        ],
      },
      (url) => isPathShown(["/docs/custom-domains"], url),
    );
    expect(tree.children.map((node) => node.name)).toEqual(["Intro", "More"]);
  });
});
