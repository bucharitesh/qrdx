// Turns a docs page's processed Markdown (fumadocs `getText("processed")`,
// which keeps the authored MDX components as JSX) into plain Markdown for
// LLMs: /docs/<page>.md, "Copy Markdown" and llms-full.txt.
//
// - Live demos and other client-only widgets (<ComponentPreview />, …) go.
// - Wrappers (<Tabs>, <Callout>, <Steps>, …) keep their content, dedented, so
//   code blocks inside them stay code blocks.
// - <Card> becomes a link list item, <InstallationTabs> and
//   <PackageManagerTabs> become the shell command, <QrCatalog> the catalogue's
//   values.
// - <IfAvailable> keeps its content only where the feature is offered, so the
//   Markdown never describes something this deployment can't do.
// - Root-relative links become absolute.
//
// Code blocks and inline code are masked first and never touched.
import {
  BODY_CATALOG,
  DOT_CATALOG,
  EYE_CATALOG,
  FRAME_CATALOG,
} from "@/lib/pattern-catalog";

export interface LlmMarkdownOptions {
  /** Origin for root-relative links and the shadcn registry, e.g. https://qrdx.dev */
  origin?: string;
  /**
   * Whether an <IfAvailable> block is shown on this deployment, from its
   * attributes (`feature`, `path`, `integration`). Defaults to shown.
   */
  isShown?: (attributes: Record<string, string>) => boolean;
}

type Attributes = Record<string, string>;

interface ElementNode {
  type: "element";
  name: string;
  attributes: Attributes;
  raw: string;
  selfClosing: boolean;
  children: Node[];
}

type Node = { type: "text"; value: string } | ElementNode;

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})/;
const MASK = "\u0000";
const FENCE_TOKEN = new RegExp(`^([ \\t]*)${MASK}F(\\d+)${MASK}[ \\t]*$`, "gm");
const CODE_TOKEN = new RegExp(`${MASK}C(\\d+)${MASK}`, "g");

interface Fence {
  lines: string[];
  indent: number;
}

/** Replaces each fenced code block with one placeholder line (same indent). */
function maskFences(text: string): { text: string; fences: Fence[] } {
  const fences: Fence[] = [];
  const out: string[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) {
      out.push(lines[i]);
      continue;
    }
    const [, indent, marker] = open;
    const close = new RegExp(`^[ \\t]*${marker[0]}{${marker.length},}[ \\t]*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end])) end++;
    fences.push({ lines: lines.slice(i, end + 1), indent: indent.length });
    out.push(`${indent}${MASK}F${fences.length - 1}${MASK}`);
    i = end;
  }
  return { text: out.join("\n"), fences };
}

const shiftLines = (lines: string[], shift: number) =>
  lines
    .map((line) => {
      const lead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
      return line.slice(Math.min(shift, lead));
    })
    .join("\n");

/** Puts the code blocks back, shifted left as far as their placeholder moved. */
function restoreFences(text: string, fences: Fence[]): string {
  return (
    text
      .replace(FENCE_TOKEN, (_, indent: string, index: string) => {
        const fence = fences[Number(index)];
        return shiftLines(
          fence.lines,
          Math.max(0, fence.indent - indent.length),
        );
      })
      // A block that ended up inside a line (a wrapper flattened it): on its own.
      .replace(new RegExp(`${MASK}F(\\d+)${MASK}`, "g"), (_, index: string) => {
        const fence = fences[Number(index)];
        return `\n${shiftLines(fence.lines, fence.indent)}\n`;
      })
  );
}

function maskInlineCode(text: string): { text: string; spans: string[] } {
  const spans: string[] = [];
  const masked = text.replace(/``[^\n]*?``|`[^`\n]+`/g, (span) => {
    spans.push(span);
    return `${MASK}C${spans.length - 1}${MASK}`;
  });
  return { text: masked, spans };
}

// ─── A small JSX tag reader (enough for the MDX components in the docs) ─────

type Token =
  | { type: "text"; value: string }
  | {
      type: "open";
      name: string;
      attributes: Attributes;
      raw: string;
      selfClosing: boolean;
    }
  | { type: "close"; name: string; raw: string };

const NAME = /[A-Z][A-Za-z0-9.]*/y;

/** Reads `<Name …>` or `<Name … />` at `start`; null when it isn't a tag. */
function readOpenTag(
  text: string,
  start: number,
): { token: Token; end: number } | null {
  NAME.lastIndex = start + 1;
  const name = NAME.exec(text)?.[0];
  if (!name) return null;
  let i = start + 1 + name.length;
  if (!/[\s/>]/.test(text[i] ?? "")) return null;
  let depth = 0;
  let quote: string | null = null;
  for (; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (depth > 0) {
      if (char === "{") depth++;
      else if (char === "}") depth--;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === ">") {
      const raw = text.slice(start, i + 1);
      const selfClosing = text[i - 1] === "/";
      const body = raw.slice(1 + name.length, selfClosing ? -2 : -1);
      return {
        token: {
          type: "open",
          name,
          attributes: readAttributes(body),
          raw,
          selfClosing,
        },
        end: i + 1,
      };
    }
  }
  return null;
}

/** String attributes (`a="x"`, `a='x'`, `a={"x"}`, bare `a`); others are skipped. */
function readAttributes(body: string): Attributes {
  const attributes: Attributes = {};
  const pattern =
    /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{))?/g;
  let depth = 0;
  for (let i = 0; i < body.length; ) {
    if (depth > 0) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      i++;
      continue;
    }
    pattern.lastIndex = i;
    const match = pattern.exec(body);
    if (!match || match.index !== i) {
      i++;
      continue;
    }
    const [whole, key, double, single, braced] = match;
    if (whole.endsWith("{") && braced === undefined) {
      depth = 1;
    } else {
      attributes[key] = double ?? single ?? braced ?? "true";
    }
    i += whole.length;
  }
  return attributes;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      buffer += text.slice(i);
      break;
    }
    buffer += text.slice(i, lt);
    const close = /^<\/([A-Z][A-Za-z0-9.]*)\s*>/.exec(text.slice(lt));
    const open = close ? null : readOpenTag(text, lt);
    if (!close && !open) {
      buffer += "<";
      i = lt + 1;
      continue;
    }
    if (buffer) tokens.push({ type: "text", value: buffer });
    buffer = "";
    if (close) {
      tokens.push({ type: "close", name: close[1], raw: close[0] });
      i = lt + close[0].length;
    } else if (open) {
      tokens.push(open.token);
      i = open.end;
    }
  }
  if (buffer) tokens.push({ type: "text", value: buffer });
  return tokens;
}

/** Nests the tokens; tags without a partner stay as text. */
function parse(tokens: Token[]): Node[] {
  const root: ElementNode = {
    type: "element",
    name: "",
    attributes: {},
    raw: "",
    selfClosing: false,
    children: [],
  };
  const stack: ElementNode[] = [root];
  const unwind = (node: ElementNode) => {
    // An unclosed tag: its raw text, then its children, in its parent.
    const parent = stack.at(-1) as ElementNode;
    parent.children.push({ type: "text", value: node.raw }, ...node.children);
  };
  for (const token of tokens) {
    const top = stack.at(-1) as ElementNode;
    if (token.type === "text") {
      top.children.push(token);
    } else if (token.type === "open") {
      const node: ElementNode = {
        type: "element",
        name: token.name,
        attributes: token.attributes,
        raw: token.raw,
        selfClosing: token.selfClosing,
        children: [],
      };
      if (token.selfClosing) top.children.push(node);
      else stack.push(node);
    } else if (stack.some((node, i) => i > 0 && node.name === token.name)) {
      for (let node = stack.pop(); node; node = stack.pop()) {
        if (node.name === token.name) {
          (stack.at(-1) as ElementNode).children.push(node);
          break;
        }
        unwind(node);
      }
    } else {
      top.children.push({ type: "text", value: token.raw });
    }
  }
  while (stack.length > 1) unwind(stack.pop() as ElementNode);
  return root.children;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/** Block content (starts on a new line) shifted left to its least indent. */
function dedent(text: string): string {
  if (!text.includes("\n")) return text;
  const lines = text.split("\n");
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const least = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(Math.min(least, line.length)))
    .join("\n");
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

const shell = (command: string) => `\n\n\`\`\`bash\n${command}\n\`\`\`\n\n`;

const CATALOGS: Record<string, { value: string; label: string }[]> = {
  body: BODY_CATALOG,
  eye: EYE_CATALOG,
  dot: DOT_CATALOG,
  frame: FRAME_CATALOG.filter((item) => item.value !== "none"),
};

type Handler = (
  attributes: Attributes,
  children: string,
  options: Required<LlmMarkdownOptions>,
) => string;

/** Rendered as nothing: live demos and widgets with no text of their own. */
const DROP = [
  "ComponentPreview",
  "ComponentLinks",
  "ComponentSource",
  "ErrorCorrectionDemo",
  "GithubCard",
  "OpenAPIPage",
  "NpmStatus",
];

const HANDLERS: Record<string, Handler> = {
  IfAvailable: (attributes, children, options) => {
    if (!options.isShown(attributes)) return "";
    const body = dedent(children);
    return attributes.title ? `\n\n## ${attributes.title}\n\n${body}` : body;
  },
  Card: (attributes, children, options) => {
    const text = oneLine(attributes.description ?? children);
    const label = attributes.title ?? "";
    const link = attributes.href
      ? `[${label}](${absolute(attributes.href, options.origin)})`
      : `**${label}**`;
    return `- ${link}${text ? `: ${text}` : ""}`;
  },
  // Card lines, one per line, whatever the source indentation.
  Cards: (_, children) =>
    `\n\n${children
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")}\n\n`,
  Callout: (attributes, children) =>
    `\n\n${attributes.title ? `**${attributes.title}**\n\n` : ""}${dedent(children).trim()}\n\n`,
  Tab: (attributes, children) => {
    const label = attributes.value ?? attributes.title;
    return `\n\n${label ? `**${label}**\n\n` : ""}${dedent(children).trim()}\n\n`;
  },
  Accordion: (attributes, children) =>
    `\n\n${attributes.title ? `**${attributes.title}**\n\n` : ""}${dedent(children).trim()}\n\n`,
  InstallationTabs: (attributes, _, options) =>
    attributes.name
      ? shell(
          `npx shadcn@latest add ${options.origin}/r/${attributes.name}.json`,
        )
      : "",
  PackageManagerTabs: (attributes) =>
    attributes.command ? shell(attributes.command) : "",
  QrCatalog: (attributes) => {
    const items = CATALOGS[attributes.kind ?? ""];
    if (!items) return "";
    return `\n\n${items.map((item) => `- \`${item.value}\`: ${item.label}`).join("\n")}\n\n`;
  },
};

function absolute(href: string, origin: string): string {
  return origin && href.startsWith("/") && !href.startsWith("//")
    ? `${origin}${href}`
    : href;
}

function render(nodes: Node[], options: Required<LlmMarkdownOptions>): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (DROP.includes(node.name)) return "";
      const children = render(node.children, options);
      const handler = HANDLERS[node.name];
      if (handler) return handler(node.attributes, children, options);
      // Any other component: its content, or nothing when it has none.
      return node.selfClosing ? "" : dedent(children);
    })
    .join("");
}

/** Plain Markdown for LLMs from a page's processed Markdown. */
export function cleanLlmMarkdown(
  markdown: string,
  options: LlmMarkdownOptions = {},
): string {
  const resolved: Required<LlmMarkdownOptions> = {
    origin: options.origin?.replace(/\/$/, "") ?? "",
    isShown: options.isShown ?? (() => true),
  };
  const fenced = maskFences(markdown);
  const coded = maskInlineCode(fenced.text);

  let text = render(parse(tokenize(coded.text)), resolved);
  if (resolved.origin) {
    text = text.replace(
      /\]\((\/(?!\/)[^)\s]*)\)/g,
      (_, path: string) => `](${resolved.origin}${path})`,
    );
  }
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  text = text.replace(
    CODE_TOKEN,
    (_, index: string) => coded.spans[Number(index)],
  );
  return `${restoreFences(text, fenced.fences)}\n`;
}
