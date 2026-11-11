// Translating docs pages (MDX) without breaking them: what
// scripts/i18n-translate-docs.ts sends to the model, and how it checks what
// comes back. Node only; never imported by pages.
//
// 1. maskMdx() swaps what must stay byte for byte (fenced code blocks, ESM
//    import/export blocks, {/* comments */}, JSX expression props such as
//    icon={<Rocket />}) for slots like ⟦C0⟧, so the model never sees them.
// 2. The model translates prose, headings, link text and the text props of
//    components (title, description, label, alt).
// 3. mdxShape() lists everything else that must survive unchanged: slots in
//    order, inline code, link URLs, {facts.x} tokens, JSX tags in order and
//    their other props, heading levels, list items, table rows and numbers.
//    shapeProblems() compares the English and the translation.
// 4. unmaskMdx() puts the slots back.
import { createHash } from "node:crypto";

/** Component props whose values are copy (translated); every other prop is code. */
export const TEXT_PROPS = new Set(["title", "description", "label", "alt"]);

const SLOT = /⟦([A-Z])(\d+)⟧/g;

export interface Masked {
  text: string;
  slots: string[];
}

/** sha256 of an English file, shortened: a translation records the one it came from. */
export function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/** "---\nkey: value\n---\nbody" → its frontmatter lines and body. */
export function splitFrontmatter(source: string): {
  frontmatter: string[];
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { frontmatter: [], body: source };
  return {
    frontmatter: (match[1] as string).split(/\r?\n/),
    body: source.slice(match[0].length),
  };
}

/** A one-line frontmatter value (plain or quoted). Multi-line values aren't used in the docs. */
export function frontmatterValue(
  lines: readonly string[],
  key: string,
): string | undefined {
  const line = lines.find((entry) => entry.startsWith(`${key}:`));
  if (line === undefined) return undefined;
  const raw = line.slice(key.length + 1).trim();
  if (raw.startsWith('"')) return JSON.parse(raw) as string;
  if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  if (/^[>|]/.test(raw)) {
    throw new Error(`multi-line frontmatter value for ${key} isn't supported`);
  }
  return raw;
}

/** The frontmatter with `values` swapped in (JSON-quoted, which YAML reads). */
export function withFrontmatter(
  lines: readonly string[],
  values: Record<string, string>,
): string[] {
  return lines.map((line) => {
    const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1];
    return key !== undefined && key in values
      ? `${key}: ${JSON.stringify(values[key])}`
      : line;
  });
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})/;

/** Swaps code and other untranslatable parts for numbered slots. */
export function maskMdx(body: string): Masked {
  const slots: string[] = [];
  const slot = (kind: string, content: string) => {
    slots.push(content);
    return `⟦${kind}${slots.length - 1}⟧`;
  };

  // Fenced code blocks and top-level ESM (import/export) blocks.
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      const [, indent, marker] = fence as unknown as [string, string, string];
      const close = new RegExp(
        `^\\s*${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`,
      );
      let end = i + 1;
      while (end < lines.length && !close.test(lines[end] as string)) end++;
      // The slot line keeps the fence's indentation; the slot holds the rest.
      const block = lines
        .slice(i, end + 1)
        .join("\n")
        .slice(indent.length);
      out.push(`${indent}${slot("C", block)}`);
      i = end;
      continue;
    }
    if (/^(?:import|export)\s/.test(line)) {
      let end = i;
      while (
        end + 1 < lines.length &&
        (lines[end + 1] as string).trim() !== ""
      ) {
        end++;
      }
      out.push(slot("M", lines.slice(i, end + 1).join("\n")));
      i = end;
      continue;
    }
    out.push(line);
  }
  let text = out.join("\n");

  // {/* comments */}
  text = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, (comment) => slot("X", comment));

  // JSX expression props: name={...} with balanced braces.
  let result = "";
  let index = 0;
  for (const match of text.matchAll(/(\s[A-Za-z][\w-]*)=\{/g)) {
    const start = (match.index as number) + match[0].length - 1;
    if (start < index) continue;
    let depth = 0;
    let end = start;
    for (; end < text.length; end++) {
      const char = text[end];
      if (char === "{") depth++;
      else if (char === "}" && --depth === 0) break;
    }
    if (depth !== 0) continue;
    result += `${text.slice(index, start)}{${slot("E", text.slice(start + 1, end))}}`;
    index = end + 1;
  }
  text = result + text.slice(index);

  return { text, slots };
}

/** Puts the slots back. Throws on a slot the translation invented. */
export function unmaskMdx(text: string, slots: readonly string[]): string {
  // Code blocks keep the indentation their slot line had (inside <Tab>).
  return text.replace(SLOT, (whole, _kind: string, n: string) => {
    const content = slots[Number(n)];
    if (content === undefined) throw new Error(`unknown slot ${whole}`);
    return content;
  });
}

export interface MdxShape {
  slots: string[];
  inlineCode: string[];
  urls: string[];
  facts: string[];
  tags: string[];
  /** Each JSX opening tag with its code props (text props blanked). */
  props: string[];
  headings: string[];
  listItems: number;
  tableRows: number;
  numbers: string[];
}

const sorted = (values: string[]) => [...values].sort();

/** What must survive translation unchanged, read from masked MDX. */
export function mdxShape(masked: string): MdxShape {
  const slots = [...masked.matchAll(SLOT)].map((match) => match[0]);
  const inlineCode = [
    ...masked.matchAll(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g),
  ].map((match) => match[0]);
  // The rest is read with inline code taken out (it can hold < and digits).
  const prose = masked.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, " ");
  const urls = [
    ...[...prose.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(
      (match) => match[1] as string,
    ),
    ...[...prose.matchAll(/<(https?:\/\/[^>\s]+)>/g)].map(
      (match) => match[1] as string,
    ),
    ...[...prose.matchAll(/\shref="([^"]*)"/g)].map(
      (match) => match[1] as string,
    ),
    ...[...prose.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map(
      (match) => match[1] as string,
    ),
  ];
  const facts = [...prose.matchAll(/\{facts\.\w+\}/g)].map((match) => match[0]);
  const tagMatches = [
    ...prose.matchAll(
      /<(\/?)([A-Za-z][\w.-]*)((?:[^<>"'{}]|"[^"]*"|'[^']*'|\{[^{}]*\})*?)(\/?)>/g,
    ),
  ];
  const tags = tagMatches.map(
    (match) => `${match[1]}${match[2]}${match[4] ? "/" : ""}`,
  );
  const props = tagMatches
    .filter((match) => !match[1])
    .map((match) => {
      const attrs = [
        ...(match[3] as string).matchAll(
          /([A-Za-z][\w-]*)(?:=("[^"]*"|'[^']*'|\{[^{}]*\}))?/g,
        ),
      ].map(([, name, value]) =>
        TEXT_PROPS.has(name as string) && value?.[0] !== "{"
          ? `${name}=…`
          : `${name}=${value ?? ""}`,
      );
      return `${match[2]} ${attrs.join(" ")}`;
    });
  const lines = prose.split("\n");
  const headings = lines.flatMap((line) => {
    const match = /^\s*(#{1,6})\s/.exec(line);
    return match ? [match[1] as string] : [];
  });
  const listItems = lines.filter((line) =>
    /^\s*(?:[-*+]|\d+[.)])\s/.test(line),
  ).length;
  const tableRows = lines.filter((line) => /^\s*\|/.test(line)).length;
  // Numbers in the copy, without URLs, slots and thousands separators.
  const numbers = [
    ...prose
      .replace(/\]\([^)]*\)/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(SLOT, " ")
      .replace(/\{facts\.\w+\}/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      // Not digits inside a name (n8n, GA4, 2FA).
      .matchAll(/(?<![A-Za-z])\d+(?:[.,]\d{3})*(?:[.,]\d+)?(?![A-Za-z])/g),
  ].map((match) =>
    // 10,000 and 10.000 are the same number; so are 1.5 and 1,5.
    match[0].replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", "."),
  );

  return {
    slots,
    inlineCode: sorted(inlineCode),
    urls: sorted(urls),
    facts: sorted(facts),
    tags,
    props,
    headings,
    listItems,
    tableRows,
    numbers: sorted(numbers),
  };
}

const missingFrom = (english: string[], translated: string[]) => {
  const left = [...translated];
  return english.filter((value) => {
    const at = left.indexOf(value);
    if (at === -1) return true;
    left.splice(at, 1);
    return false;
  });
};

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** Why a translation can't be used; empty when it keeps everything it must. */
export function shapeProblems(
  english: MdxShape,
  translated: MdxShape,
): string[] {
  const problems: string[] = [];
  const list = (values: string[]) =>
    values
      .slice(0, 5)
      .map((value) => JSON.stringify(value))
      .join(", ");
  if (!same(english.slots, translated.slots)) {
    problems.push(
      `code and markup slots changed: expected ${english.slots.join(" ")}, got ${translated.slots.join(" ")}`,
    );
  }
  for (const key of ["inlineCode", "urls", "facts"] as const) {
    const lost = missingFrom(english[key], translated[key]);
    // Backticks added around a name are harmless; changed code shows up as
    // missing.
    const added =
      key === "inlineCode" ? [] : missingFrom(translated[key], english[key]);
    if (lost.length || added.length) {
      problems.push(
        `${key} changed${lost.length ? `; missing ${list(lost)}` : ""}${added.length ? `; unexpected ${list(added)}` : ""}`,
      );
    }
  }
  if (!same(english.tags, translated.tags)) {
    problems.push(
      `JSX/HTML tags changed: expected ${english.tags.join(" ")}, got ${translated.tags.join(" ")}`,
    );
  } else {
    english.props.forEach((props, i) => {
      if (props !== translated.props[i]) {
        problems.push(
          `component props changed: expected <${props}>, got <${translated.props[i]}> (only title, description, label and alt may be translated)`,
        );
      }
    });
  }
  if (!same(english.headings, translated.headings)) {
    problems.push(
      `headings changed: expected ${english.headings.length} (${english.headings.join(" ")}), got ${translated.headings.length} (${translated.headings.join(" ")})`,
    );
  }
  if (english.listItems !== translated.listItems) {
    problems.push(
      `list items changed: expected ${english.listItems}, got ${translated.listItems}`,
    );
  }
  if (english.tableRows !== translated.tableRows) {
    problems.push(
      `table rows changed: expected ${english.tableRows}, got ${translated.tableRows}`,
    );
  }
  const lostNumbers = missingFrom(english.numbers, translated.numbers);
  if (lostNumbers.length) {
    problems.push(`numbers missing: ${list(lostNumbers)}`);
  }
  return problems;
}

/**
 * Masked text in pieces of about `maxWords`, split before "## " headings
 * (never inside a slot, which is one line), so each request stays small.
 */
export function splitChunks(masked: string, maxWords: number): string[] {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  if (words(masked) <= maxWords) return [masked];
  const sections = masked.split(/\n(?=## )/);
  const chunks: string[] = [];
  let current = "";
  for (const section of sections) {
    if (current && words(current) + words(section) > maxWords) {
      chunks.push(current);
      current = section;
    } else {
      current = current ? `${current}\n${section}` : section;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** components/mdx/if-available.tsx's anchor for a section title. */
export function ifAvailableSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Gives each translated <IfAvailable title="…"> the English anchor in
 * `id`, so links to #section keep working in every language.
 */
export function pinIfAvailableIds(english: string, translated: string): string {
  const titles = [...english.matchAll(/<IfAvailable\b([^>]*)>/g)].map(
    (match) => /\stitle="([^"]*)"/.exec(match[1] as string)?.[1],
  );
  let i = 0;
  return translated.replace(
    /<IfAvailable\b([^>]*)>/g,
    (whole, attrs: string) => {
      const title = titles[i++];
      if (!title || /\sid=/.test(attrs)) return whole;
      const translatedTitle = /\stitle="([^"]*)"/.exec(attrs)?.[1];
      if (translatedTitle === title) return whole;
      return whole.replace(
        /\stitle="/,
        ` id="${ifAvailableSlug(title)}" title="`,
      );
    },
  );
}

/**
 * Braces in prose (outside code, {facts.x} and tags): in MDX a bare { starts
 * an expression, so a translation must not add any.
 */
export function proseBraces(text: string): number {
  const prose = text
    .replace(SLOT, "")
    .replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, "")
    .replace(/\{facts\.\w+\}/g, "")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/=\{[^{}]*\}/g, "");
  return (prose.match(/[{}]/g) ?? []).length;
}
