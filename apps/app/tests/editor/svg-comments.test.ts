// SVG uploads have their comments stripped before they become a data: URL.
// One regex pass left behind a comment that only forms once an inner one is
// removed ("<!<!-- a -->-- b -->" → "<!-- b -->"); the scan removes it too,
// matches the regex repeated until nothing changes, and stays linear.
import { describe, expect, it } from "vitest";
import { optimizeSvgContent, stripXmlComments } from "@/utils/ai/image-upload";
import { createRandom } from "../support/prng";

/** The reference: the old regex pass, repeated until nothing changes. */
function stripToFixpoint(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<!--[\s\S]*?-->/g, "");
  } while (current !== previous);
  return current;
}

describe("stripXmlComments", () => {
  it("removes a comment that removing an inner one forms", () => {
    expect(stripXmlComments("<svg><!<!-- x -->-- y --></svg>")).toBe(
      "<svg></svg>",
    );
    expect(optimizeSvgContent("<svg><!<!-- x -->-- y --></svg>")).toBe(
      "<svg></svg>",
    );
  });

  it.each([
    ["<svg>  <!-- a -->  <g/>  </svg>", "<svg><g/></svg>"],
    [
      "<svg><!-- a --><!-- b --><path d='M0'/></svg>",
      "<svg><path d='M0'/></svg>",
    ],
    ["<svg><!-- unterminated <g/></svg>", "<svg><!-- unterminated <g/></svg>"],
    ["<svg><!----></svg>", "<svg></svg>"],
    ["<svg><!--></svg>", "<svg><!--></svg>"],
    ["<svg>😀<!-- é -->ü</svg>", "<svg>😀ü</svg>"],
  ])("optimizes %s as before", (input, expected) => {
    expect(optimizeSvgContent(input)).toBe(expected);
  });

  it("matches the repeated regex pass on random input", () => {
    const random = createRandom(20261110);
    const alphabet = ["<", "!", "-", ">", "a", " "];
    for (let i = 0; i < 20_000; i++) {
      const input = random.string(alphabet, 0, 40);
      expect(stripXmlComments(input), JSON.stringify(input)).toBe(
        stripToFixpoint(input),
      );
    }
  });

  it("keeps characters outside the BMP and lone surrogates as they are", () => {
    expect(stripXmlComments("a😀<!--x-->\ud800b")).toBe("a😀\ud800b");
  });

  it("strips deeply nested comments in linear time", () => {
    // 20,000 levels: the repeated regex pass takes seconds on this.
    const depth = 20_000;
    const input = `<svg>${"<!".repeat(depth)}<!--x-->${"--x-->".repeat(depth)}</svg>`;
    const started = performance.now();
    expect(stripXmlComments(input)).toBe("<svg></svg>");
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("handles a 4 MB upload, the largest the uploader reads, quickly", () => {
    const depth = 500_000; // 4 MB of nested comment openers and closers
    const input = `${"<!".repeat(depth)}<!--x-->${"--x-->".repeat(depth)}`;
    expect(input.length).toBeGreaterThan(4_000_000);
    const started = performance.now();
    expect(stripXmlComments(input)).toBe("");
    expect(performance.now() - started).toBeLessThan(500);
  });
});
