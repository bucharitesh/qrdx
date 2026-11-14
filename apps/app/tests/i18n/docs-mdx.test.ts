// The docs translator's MDX handling (lib/i18n/mdx.ts): masking is lossless
// on every real docs page, and the shape check catches what a translation
// must not change.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { translationLocale } from "@/lib/i18n/docs";
import {
  fileHash,
  frontmatterValue,
  ifAvailableSlug,
  maskMdx,
  mdxShape,
  pinIfAvailableIds,
  proseBraces,
  shapeProblems,
  splitChunks,
  splitFrontmatter,
  unmaskMdx,
  withFrontmatter,
} from "@/lib/i18n/mdx";

const DOCS = join(__dirname, "../../content/docs");

function englishPages(dir = DOCS): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return englishPages(full);
    const rel = relative(DOCS, full);
    return rel.endsWith(".mdx") && !translationLocale(rel) ? [full] : [];
  });
}

const SAMPLE = `Intro with \`inline code\`, a [link](/docs/help#faq) and {facts.bodyPatterns} patterns.

## Install [#install]

\`\`\`bash
npm install qrdx
\`\`\`

{/* a comment */}

<Card icon={<Rocket />} href="/docs/help" title="Help" description="Answers" />

<IfAvailable feature="customDomains" title="Custom domains">
  Use 10,000 codes.
</IfAvailable>

| A | B |
| - | - |
| 1 | 2 |

- one
- two
`;

describe("maskMdx", () => {
  it("round-trips every English docs page byte for byte", () => {
    const pages = englishPages();
    expect(pages.length).toBeGreaterThan(50);
    for (const file of pages) {
      const { body } = splitFrontmatter(readFileSync(file, "utf8"));
      const masked = maskMdx(body);
      expect(unmaskMdx(masked.text, masked.slots), file).toBe(body);
      // The masked text shows no code: fences, imports and comments are slots.
      expect(masked.text, file).not.toMatch(/^\s*```/m);
      expect(masked.text, file).not.toMatch(/\{\/\*/);
    }
  });

  it("swaps code, comments and expression props for slots", () => {
    const { text, slots } = maskMdx(SAMPLE);
    expect(text).toContain("⟦C0⟧");
    expect(text).toContain("⟦X1⟧");
    expect(text).toContain("icon={⟦E2⟧}");
    expect(slots[0]).toBe("```bash\nnpm install qrdx\n```");
    expect(slots[2]).toBe("<Rocket />");
    // Prose, link URLs and facts tokens stay visible to the translator.
    expect(text).toContain("[link](/docs/help#faq)");
    expect(text).toContain("{facts.bodyPatterns}");
  });

  it("keeps a code block's indentation inside a component", () => {
    const body = "<Tab>\n  ```ts\n  const a = 1;\n  ```\n</Tab>\n";
    const { text, slots } = maskMdx(body);
    expect(text).toBe("<Tab>\n  ⟦C0⟧\n</Tab>\n");
    expect(unmaskMdx(text, slots)).toBe(body);
  });
});

describe("shapeProblems", () => {
  const english = maskMdx(SAMPLE).text;
  const shape = mdxShape(english);
  const translate = (from: string, to: string) =>
    shapeProblems(shape, mdxShape(english.replace(from, to)));

  it("passes a translation that only changes words and text props", () => {
    const es = english
      .replace("Intro with", "Introducción con")
      .replace("a [link]", "un [enlace]")
      .replace("## Install", "## Instalar")
      .replace('title="Help"', 'title="Ayuda"')
      .replace('description="Answers"', 'description="Respuestas"')
      .replace("Use 10,000 codes.", "Usa 10.000 códigos.")
      .replace("- one", "- uno");
    expect(shapeProblems(shape, mdxShape(es))).toEqual([]);
  });

  it("catches a changed URL, inline code, facts token or slot", () => {
    expect(translate("/docs/help#faq", "/docs/ayuda#faq")[0]).toMatch(/urls/);
    expect(translate("`inline code`", "`código`")[0]).toMatch(/inlineCode/);
    // Backticks added around a name are fine.
    expect(translate("Intro with", "Intro `qrdx` with")).toEqual([]);
    expect(translate("{facts.bodyPatterns}", "muchos")[0]).toMatch(/facts/);
    expect(translate("⟦C0⟧", "")[0]).toMatch(/slots/);
  });

  it("catches changed component props, tags, headings, lists, tables and numbers", () => {
    expect(translate('href="/docs/help"', 'href="/docs/ayuda"').join()).toMatch(
      /props|urls/,
    );
    expect(
      translate('feature="customDomains"', 'feature="dominios"')[0],
    ).toMatch(/props/);
    expect(translate("</IfAvailable>", "")[0]).toMatch(/tags/);
    expect(translate("## Install", "Install")[0]).toMatch(/headings/);
    expect(translate("- two", "two")[0]).toMatch(/list items/);
    expect(translate("| 1 | 2 |", "1 2")[0]).toMatch(/table rows/);
    expect(translate("10,000", "diez mil")[0]).toMatch(/numbers/);
    // Digits inside a name aren't numbers.
    expect(mdxShape("Use n8n and GA4 with 2FA.").numbers).toEqual([]);
  });

  it("reads thousands grouped the way each language writes them", () => {
    const numbers = (text: string) => mdxShape(text).numbers;
    const english = numbers(
      "Up to 1,000 codes, 10,000 scans and 100,000 rows.",
    );
    expect(english).toEqual(["1000", "10000", "100000"]);
    // French: a space, a no-break space or a narrow no-break space.
    expect(
      numbers("Jusqu'à 1 000 codes, 10\u00A0000 scans et 100\u202F000 lignes."),
    ).toEqual(english);
    // Hindi: lakh grouping.
    expect(numbers("1,000 कोड, 10,000 स्कैन और 1,00,000 पंक्तियाँ।")).toEqual(
      english,
    );
    expect(numbers("12,34,567.5")).toEqual(["1234567.5"]);
    // Decimals keep their comma or point.
    expect(numbers("1,5 Mo")).toEqual(["1.5"]);
    // A number written against its unit, as Korean does, still counts.
    expect(
      shapeProblems(
        mdxShape("Under 200 MB, one point is 0.353 mm, at most 32 KB."),
        mdxShape("200MB 미만, 한 점은 0.353mm, 최대 32KB입니다."),
      ),
    ).toEqual([]);
    expect(
      shapeProblems(mdxShape("Under 200 MB."), mdxShape("100MB 미만."))[0],
    ).toMatch(/numbers missing: "200"/);
    // Two numbers on separate lines stay two numbers.
    expect(numbers("5\n100")).toEqual(["100", "5"]);
  });

  it("counts braces a translation adds to prose", () => {
    expect(proseBraces(english)).toBe(0);
    expect(proseBraces(`${english}\n{oops}`)).toBe(2);
  });
});

describe("splitChunks", () => {
  it("splits long text before ## headings and loses nothing", () => {
    const section = (n: number) => `## Part ${n}\n\n${"word ".repeat(300)}`;
    const text = [1, 2, 3, 4].map(section).join("\n");
    const chunks = splitChunks(text, 700);
    expect(chunks.length).toBe(2);
    expect(chunks.join("\n")).toBe(text);
    expect(chunks[1]?.startsWith("## Part 3")).toBe(true);
  });
});

describe("frontmatter", () => {
  it("reads and replaces title and description, keeping other keys", () => {
    const { frontmatter, body } = splitFrontmatter(
      "---\ntitle: Help center\ndescription: Answers for everyone.\nicon: LifeBuoy\n---\n\nBody",
    );
    expect(frontmatterValue(frontmatter, "title")).toBe("Help center");
    expect(body).toBe("\nBody");
    expect(
      withFrontmatter(frontmatter, { title: 'Centro de "ayuda"' }),
    ).toEqual([
      'title: "Centro de \\"ayuda\\""',
      "description: Answers for everyone.",
      "icon: LifeBuoy",
    ]);
  });

  it("hashes the English it came from", () => {
    expect(fileHash("a")).toHaveLength(12);
    expect(fileHash("a")).not.toBe(fileHash("b"));
  });
});

describe("pinIfAvailableIds", () => {
  it("gives a translated section title the English anchor", () => {
    const english = '<IfAvailable feature="slackBot" title="Add the bot">';
    const translated = '<IfAvailable feature="slackBot" title="Añade el bot">';
    expect(pinIfAvailableIds(english, translated)).toBe(
      '<IfAvailable feature="slackBot" id="add-the-bot" title="Añade el bot">',
    );
    expect(ifAvailableSlug("GS1 Digital Link")).toBe("gs1-digital-link");
    // Untranslated titles and tags without one are left alone.
    expect(pinIfAvailableIds(english, english)).toBe(english);
  });
});
