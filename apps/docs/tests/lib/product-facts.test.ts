// Product counts in copy come from the engine's catalogue (lib/product-facts.ts)
// through `{facts.<name>}` tokens, so they can't drift from the playground.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";
import {
  BODY_PATTERN,
  CORNER_EYE_DOT_PATTERNS,
  CORNER_EYE_PATTERNS,
  FRAME_STYLES,
} from "qrdx/types";
import { remark } from "remark";
import remarkMdx from "remark-mdx";
import { describe, expect, it } from "vitest";
import {
  fillFacts,
  fillFactsDeep,
  PRODUCT_FACTS,
  STYLE_SUMMARY,
} from "@/lib/product-facts";
import { remarkNpmStatus } from "@/lib/remark-npm-status";
import { remarkProductFacts } from "@/lib/remark-product-facts";
import qrdxPackage from "../../../../packages/qrdx/package.json";

const app = path.resolve(import.meta.dirname, "../..");
const repo = path.resolve(app, "../..");

/** The processed Markdown (llms-full.txt, "Copy Markdown") of an MDX source. */
function toMarkdown(source: string): Promise<string> {
  const processor = remark()
    .use(remarkMdx)
    .use(remarkProductFacts)
    .use(remarkNpmStatus)
    .use(remarkLLMs, { _data: true });
  return new Promise((resolve, reject) => {
    processor.run(processor.parse(source), source, (error, _tree, file) => {
      if (error || !file) reject(error);
      else resolve(String(file.data.markdown));
    });
  });
}

describe("PRODUCT_FACTS", () => {
  it("counts the engine's catalogue", () => {
    expect(PRODUCT_FACTS).toEqual({
      bodyPatterns: BODY_PATTERN.length,
      eyeShapes: CORNER_EYE_PATTERNS.length,
      eyeCentres: CORNER_EYE_DOT_PATTERNS.length,
      frames: FRAME_STYLES.length - 1,
    });
    expect(FRAME_STYLES).toContain("none");
    expect(STYLE_SUMMARY).toBe(
      `${BODY_PATTERN.length} body patterns, ${CORNER_EYE_PATTERNS.length} corner-eye shapes and ${CORNER_EYE_DOT_PATTERNS.length} eye centres`,
    );
  });
});

describe("fillFacts", () => {
  it("replaces tokens in strings and frontmatter objects", () => {
    expect(fillFacts("{facts.bodyPatterns} body · {facts.frames} frames")).toBe(
      `${PRODUCT_FACTS.bodyPatterns} body · ${PRODUCT_FACTS.frames} frames`,
    );
    expect(
      fillFactsDeep({
        title: "x",
        rows: [{ qrdx: "{facts.eyeShapes}", ok: true }, { qrdx: false }],
        when: 3,
      }),
    ).toEqual({
      title: "x",
      rows: [
        { qrdx: String(PRODUCT_FACTS.eyeShapes), ok: true },
        { qrdx: false },
      ],
      when: 3,
    });
  });

  it("fails the build on an unknown name", () => {
    expect(() => fillFacts("{facts.bodyPatternz}")).toThrow(/bodyPatternz/);
  });
});

describe("remarkProductFacts", () => {
  it("puts the number in the processed Markdown", async () => {
    const markdown = await toMarkdown(
      "There are {facts.bodyPatterns} body patterns and {facts.frames} frames.\n",
    );
    expect(markdown).toContain(
      `There are ${PRODUCT_FACTS.bodyPatterns} body patterns and ${PRODUCT_FACTS.frames} frames.`,
    );
    expect(markdown).not.toContain("facts.");
  });

  it("rejects an unknown name", async () => {
    await expect(toMarkdown("{facts.nope} things\n")).rejects.toThrow(/nope/);
  });
});

describe("remarkNpmStatus", () => {
  it("leaves a line in the Markdown copy that stays true", async () => {
    const markdown = await toMarkdown(
      'Intro.\n\n<NpmStatus package="qrdx" />\n',
    );
    expect(markdown).toContain(
      `> This page describes qrdx ${qrdxPackage.version}. Run \`npm view qrdx version\` to see the version npm installs.`,
    );
    expect(markdown).not.toContain("<NpmStatus");
  });
});

// A literal number in front of one of these nouns is a count that will go
// stale: write `{facts.<name>}` instead (lib/product-facts.ts).
const HARD_CODED_COUNT =
  /\b(\d+|six|nine|eleven|seventeen|nineteen|twenty(?:-one|-three)?)\s+(body patterns?|body ·|corner[- ]eye(?: shapes| patterns| dot patterns)?|eye(?: shapes| patterns)|eye[- ]dot(?: shapes| patterns)?|eye cent(?:re|er)s|(?:call-to-action )?frames|frame (?:styles|templates)|templates)\b/i;

function filesUnder(dir: string, extensions: RegExp): string[] {
  return readdirSync(path.join(app, dir), { recursive: true })
    .map(String)
    .filter((file) => extensions.test(file))
    .map((file) => path.join(dir, file));
}

describe("product counts in copy", () => {
  it("aren't hard-coded in content, metadata, llms.txt or config", () => {
    const files = [
      // Changelog entries are history: they keep the numbers of their release.
      ...filesUnder("content", /\.mdx?$/).filter(
        (file) => !file.startsWith(`content${path.sep}changelog`),
      ),
      ...["app", "components", "config", "lib"].flatMap((dir) =>
        filesUnder(dir, /\.(ts|tsx)$/),
      ),
    ];
    const offenders = files.flatMap((file) =>
      readFileSync(path.join(app, file), "utf8")
        .split("\n")
        .flatMap((line, index) => {
          const match = HARD_CODED_COUNT.exec(line);
          return match ? [`${file}:${index + 1}: "${match[0]}"`] : [];
        }),
    );
    expect(offenders).toEqual([]);
  });

  it("match the catalogue in the root README", () => {
    const readme = readFileSync(path.join(repo, "README.md"), "utf8");
    const expected: Record<string, number> = {
      "body patterns": PRODUCT_FACTS.bodyPatterns,
      "corner-eye shapes": PRODUCT_FACTS.eyeShapes,
      "eye centres": PRODUCT_FACTS.eyeCentres,
      "call-to-action frames": PRODUCT_FACTS.frames,
    };
    for (const match of readme.matchAll(
      /\b(\d+) (body patterns|corner-eye shapes|eye centres|call-to-action frames)\b/g,
    )) {
      expect(`${match[1]} ${match[2]}`).toBe(
        `${expected[match[2]]} ${match[2]}`,
      );
    }
    expect(readme).toContain(`${PRODUCT_FACTS.bodyPatterns} body patterns`);
  });
});
