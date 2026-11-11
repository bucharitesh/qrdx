// bun run --filter docs i18n:extract <file.tsx...> [--namespace <ns> | --prefix <ns>] [--dry-run]
//
// Moves the plain copy of React components into messages/en.json and swaps
// it for next-intl calls, so i18n:translate can translate it. It converts:
// - JSX text, alone or mixed with simple {values} and inline elements (a
//   sentence with a <strong> or a <Link> becomes one t.rich message, so
//   translators can reorder it);
// - copy props (aria-label, title, placeholder, alt, label, description,
//   tooltip and the like) given as a string, a template literal or a
//   condition between strings;
// - strings, template literals and conditions between strings in a JSX
//   child expression ({busy ? "Saving…" : "Save"});
// - copy fields of object literals inside a component (label: "Square");
// - the first argument of toast.success/error/info/warning/message/loading
//   and a `description:` in its options.
// Copy outside a component or hook (module-level data, helpers), text
// around block elements and anything it can't express as one message is
// listed for a person, never rewritten.
//
// Each component (a function named Like This, or a hook useThis) that gets
// a string gets `const t = useTranslations("<namespace>")` first, and an
// expression-bodied arrow component gets a block body for it. The namespace
// defaults to the file's place: components/editor/action-bar/
// download-dialog.tsx → editor.actionBar.downloadDialog; --prefix <ns> gives
// <ns>.<fileName>. Keys come from the English (the first words, camelCase),
// so a reviewer can read them.
//
// Review the diff, then run `next typegen`, `tsc` (values a message can't
// take, like a boolean or a React node, fail there) and i18n:translate.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type ArrowFunction,
  type Block,
  type JsxAttribute,
  type JsxElement,
  type JsxFragment,
  type JsxText,
  type Node,
  Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

const DOCS = path.join(__dirname, "..");
const EN = path.join(DOCS, "messages/en.json");

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const DRY = flag("--dry-run");
const NAMESPACE = value("--namespace");
const PREFIX = value("--prefix");
const files = args.filter(
  (arg, index) =>
    !arg.startsWith("--") &&
    !["--namespace", "--prefix"].includes(args[index - 1] ?? ""),
);

const COPY_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
  "tooltip",
  "emptyText",
  "helperText",
  "subtitle",
  "heading",
  "noun",
  "ctaLabel",
  "confirmLabel",
  "cancelLabel",
  "actionLabel",
  "buttonLabel",
  "caption",
  "summary",
]);
/** Object literal fields that hold copy (inside components only). */
const COPY_FIELDS = new Set([
  "label",
  "hint",
  "title",
  "description",
  "placeholder",
  "tooltip",
  "heading",
  "subtitle",
  "helperText",
  "emptyText",
  "confirmLabel",
  "cancelLabel",
  "ctaLabel",
  "actionLabel",
  "buttonLabel",
  "caption",
  "summary",
  "noun",
]);
/** Elements whose text is code or keys, not copy. */
const LITERAL_ELEMENTS = new Set(["code", "kbd", "pre", "samp"]);
/** Elements that never sit inside a sentence. */
const BLOCK_ELEMENTS = new Set([
  "div",
  "p",
  "ul",
  "ol",
  "li",
  "section",
  "header",
  "footer",
  "table",
  "tr",
  "td",
  "th",
  "h1",
  "h2",
  "h3",
  "h4",
  "form",
  "nav",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "svg",
  "img",
]);
const TOAST = /^toast\.(?:success|error|info|warning|message|loading)$/;

const ENTITIES: Record<string, string> = {
  "&apos;": "'",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&quot;": '"',
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&amp;": "&",
  "&nbsp;": " ",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&middot;": "·",
  "&times;": "×",
  "&rarr;": "→",
  "&larr;": "←",
};
const decode = (text: string) =>
  text.replace(/&[a-z]+;/g, (entity) => ENTITIES[entity] ?? entity);

const camel = (text: string) =>
  text
    .replace(/[-_/.]+(.)?/g, (_, char: string | undefined) =>
      char ? char.toUpperCase() : "",
    )
    .replace(/^./, (char) => char.toLowerCase());

/** components/editor/action-bar/download-dialog.tsx → editor.actionBar.downloadDialog */
function namespaceFor(file: string): string {
  if (NAMESPACE) return NAMESPACE;
  const relative = path.relative(DOCS, file).replace(/\.tsx?$/, "");
  const parts = relative
    .split(path.sep)
    .filter((part) => !(part.startsWith("(") || part.startsWith("_")));
  const name = camel(parts.at(-1) as string);
  if (PREFIX) return `${PREFIX}.${name}`;
  if (parts[0] === "components" && parts[1] === "editor") {
    return ["editor", ...parts.slice(2, -1).map(camel), name].join(".");
  }
  return parts
    .filter((part) => !part.startsWith("["))
    .slice(-2)
    .map(camel)
    .join(".");
}

/** JSX text as React renders it: lines trimmed, joined with spaces. */
function jsxText(raw: string): string {
  const lines = decode(raw).split("\n");
  if (lines.length === 1) return lines[0] as string;
  return lines
    .map((line, index) => {
      let out = line;
      if (index > 0) out = out.trimStart();
      if (index < lines.length - 1) out = out.trimEnd();
      return out;
    })
    .filter((line) => line !== "")
    .join(" ");
}

const isCopy = (text: string) =>
  /\p{L}{2}/u.test(text) &&
  !/^[A-Z0-9 .+/×-]{1,5}$/.test(text.trim()) &&
  !/^[\w-]+(?:\.[\w-]+)+$/.test(text.trim()) &&
  !/^(?:https?:|mailto:|\/|#)\S*$/.test(text.trim());

/**
 * Plain text as an ICU message: braces quoted, and an apostrophe before a
 * brace, # or tag doubled (it would start a quoted literal).
 */
const icuText = (text: string) =>
  text.replace(/'(?=[{}#<])/g, "''").replace(/[{}]/g, (brace) => `'${brace}'`);

interface Report {
  file: string;
  line: number;
  why: string;
  text: string;
}

const reports: Report[] = [];
const en = JSON.parse(readFileSync(EN, "utf8")) as Record<string, unknown>;

function namespaceObject(namespace: string): Record<string, string> {
  let node = en as Record<string, unknown>;
  for (const part of namespace.split(".")) {
    if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  return node as Record<string, string>;
}

/** The key for `message` in `bucket`: the same one for the same message. */
function keyFor(bucket: Record<string, string>, message: string): string {
  for (const [key, existing] of Object.entries(bucket)) {
    if (existing === message) return key;
  }
  const words = message
    .replace(/<\/?\w+>/g, " ")
    .replace(/\{(\w+)[^}]*\}/g, " $1 ")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .slice(0, 5);
  const base =
    camel(words.map((word) => word.toLowerCase()).join("-")) || "text";
  let key = /^\d/.test(base) ? `n${base}` : base;
  for (let n = 2; key in bucket; n++) key = `${base}${n}`;
  bucket[key] = message;
  return key;
}

const FUNCTION_KINDS = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
]);

function functionName(fn: Node): string | undefined {
  if (fn.getKind() === SyntaxKind.FunctionDeclaration) {
    return fn.asKind(SyntaxKind.FunctionDeclaration)?.getName();
  }
  const own = fn.asKind(SyntaxKind.FunctionExpression)?.getName();
  if (own) return own;
  let holder = fn.getParent();
  // memo(() => …), forwardRef(function (…) {…})
  while (holder?.getKind() === SyntaxKind.CallExpression) {
    holder = holder.getParent();
  }
  return holder?.asKind(SyntaxKind.VariableDeclaration)?.getName();
}

/** The component or hook a node is in (a function named LikeThis or useThis). */
function componentOf(node: Node): Node | null {
  for (let current = node.getParent(); current; current = current.getParent()) {
    if (!FUNCTION_KINDS.has(current.getKind())) continue;
    const name = functionName(current);
    if (name && /^(?:[A-Z]|use[A-Z])/.test(name)) return current;
    // An inner callback (map, onClick): keep looking outward.
  }
  return null;
}

function bodyOf(fn: Node): Node | undefined {
  return (
    fn.asKind(SyntaxKind.FunctionDeclaration)?.getBody() ??
    fn.asKind(SyntaxKind.FunctionExpression)?.getBody() ??
    fn.asKind(SyntaxKind.ArrowFunction)?.getBody()
  );
}

function tagName(node: Node): string {
  return (
    node.asKind(SyntaxKind.JsxElement)?.getOpeningElement().getTagNameNode() ??
    node.asKind(SyntaxKind.JsxSelfClosingElement)?.getTagNameNode()
  )?.getText() as string;
}

function inLiteralElement(node: Node): boolean {
  return Boolean(
    node.getFirstAncestor(
      (ancestor) =>
        ancestor.getKind() === SyntaxKind.JsxElement &&
        LITERAL_ELEMENTS.has(tagName(ancestor)),
    ),
  );
}

/** A value an ICU argument can hold (no JSX, no conditions over JSX). */
function isSimpleValue(expression: Node): boolean {
  if (expression.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0) {
    return false;
  }
  if (
    expression.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0
  ) {
    return false;
  }
  // `busy && "Saving…"`, `a ?? "None"`: copy in a condition, not a value.
  const binary = expression.asKind(SyntaxKind.BinaryExpression);
  if (
    binary &&
    ["&&", "||", "??"].includes(binary.getOperatorToken().getText()) &&
    copyLeaves(binary)?.length
  ) {
    return false;
  }
  const kind = expression.getKind();
  return [
    SyntaxKind.Identifier,
    SyntaxKind.PropertyAccessExpression,
    SyntaxKind.ElementAccessExpression,
    SyntaxKind.CallExpression,
    SyntaxKind.NumericLiteral,
    SyntaxKind.TemplateExpression,
    SyntaxKind.BinaryExpression,
    SyntaxKind.ParenthesizedExpression,
    SyntaxKind.NonNullExpression,
    SyntaxKind.AsExpression,
  ].includes(kind);
}

/** An argument name for an expression: its last identifier. */
function argName(expression: Node, taken: Set<string>): string {
  let base = "value";
  const kind = expression.getKind();
  if (kind === SyntaxKind.Identifier) base = expression.getText();
  else if (kind === SyntaxKind.PropertyAccessExpression) {
    base =
      expression.asKind(SyntaxKind.PropertyAccessExpression)?.getName() ?? base;
  } else if (kind === SyntaxKind.NonNullExpression) {
    return argName(
      expression.asKindOrThrow(SyntaxKind.NonNullExpression).getExpression(),
      taken,
    );
  } else if (kind === SyntaxKind.CallExpression) {
    const callee = expression
      .asKindOrThrow(SyntaxKind.CallExpression)
      .getExpression();
    const name =
      callee.asKind(SyntaxKind.PropertyAccessExpression)?.getName() ??
      callee.getText();
    // formatBytes(size) → size; plan.name.toUpperCase() → name
    const [first] = expression
      .asKindOrThrow(SyntaxKind.CallExpression)
      .getArguments();
    if (first && /^format|^to[A-Z]/.test(name)) return argName(first, taken);
    if (/^to[A-Z]|^trim/.test(name)) {
      return argName(
        callee
          .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
          .getExpression(),
        taken,
      );
    }
  }
  base = base.replace(/[^\w]/g, "") || "value";
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
  taken.add(name);
  return name;
}

/** " " when JSX text starts with spaces on the same line (they render). */
const spaceBefore = (raw: string) => {
  const lead = /^\s*/.exec(raw)?.[0] ?? "";
  return lead && !lead.includes("\n") ? " " : "";
};
const spaceAfter = (raw: string) => {
  const trail = /\s*$/.exec(raw)?.[0] ?? "";
  return trail && !trail.includes("\n") ? " " : "";
};

/** Names that hold React nodes, not values: {icon}, {children}. */
const NODE_NAME =
  /^(?:children|icon|\w*Icon|element|node|badge|leading|trailing|prefix|suffix|actions?|content|trigger|preview|avatar|slot|\w*Node|\w*Element)$/;

const hasCopyText = (node: Node) =>
  node
    .getDescendantsOfKind(SyntaxKind.JsxText)
    .some((text) => isCopy(jsxText(text.getText())));

/**
 * What a JSX child is to a sentence: its words ("text"), a {value}, an
 * inline element with words ("inline"), something without words ("node":
 * an icon, {children}) or a block or condition with words ("complex").
 */
function classify(
  child: Node,
): "text" | "value" | "inline" | "node" | "complex" {
  const kind = child.getKind();
  if (kind === SyntaxKind.JsxText) {
    return isCopy(jsxText(child.getFullText())) ? "text" : "value";
  }
  if (kind === SyntaxKind.JsxExpression) {
    const expression = child
      .asKindOrThrow(SyntaxKind.JsxExpression)
      .getExpression();
    if (!expression) return "node";
    const literal =
      expression.getKind() === SyntaxKind.StringLiteral ||
      expression.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral;
    if (literal) return "value";
    const name =
      expression.asKind(SyntaxKind.PropertyAccessExpression)?.getName() ??
      expression.asKind(SyntaxKind.Identifier)?.getText();
    if (name && NODE_NAME.test(name)) return "node";
    if (isSimpleValue(expression)) return "value";
    return hasCopyText(expression) || copyLeaves(expression)
      ? "complex"
      : "node";
  }
  if (kind === SyntaxKind.JsxSelfClosingElement) return "node";
  if (kind === SyntaxKind.JsxElement) {
    if (!hasCopyText(child)) return "node";
    const tag = tagName(child);
    if (BLOCK_ELEMENTS.has(tag)) return "complex";
    // An inline element holds only text and values.
    const inner = (child as JsxElement).getJsxChildren();
    const plain = inner.every((node) => {
      const k = node.getKind();
      if (k === SyntaxKind.JsxText) return true;
      if (k === SyntaxKind.JsxExpression) {
        const e = node.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
        return (
          !e || isSimpleValue(e) || e.getKind() === SyntaxKind.StringLiteral
        );
      }
      return false;
    });
    return plain ? "inline" : "complex";
  }
  return "complex";
}

interface Message {
  /** The ICU message. */
  text: string;
  /** name → expression source. */
  values: [string, string][];
  /** Rich tags: name → `(chunks) => <El …>{chunks}</El>`. */
  tags: [string, string][];
}

/** A template literal as an ICU message (`${n} codes` → "{n} codes"). */
function templateMessage(
  node: Node,
  taken = new Set<string>(),
): Message | null {
  if (node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return {
      text: icuText(
        node
          .asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral)
          .getLiteralValue(),
      ),
      values: [],
      tags: [],
    };
  }
  const template = node.asKind(SyntaxKind.TemplateExpression);
  if (!template) return null;
  const values: [string, string][] = [];
  let text = icuText(template.getHead().getLiteralText());
  for (const span of template.getTemplateSpans()) {
    const expression = span.getExpression();
    if (!isSimpleValue(expression)) return null;
    const name = argName(expression, taken);
    values.push([name, expression.getText()]);
    text += `{${name}}${icuText(span.getLiteral().getLiteralText())}`;
  }
  return { text, values, tags: [] };
}

/**
 * A run of JSX children as one message, or the reason it can't be: text,
 * simple {values} and inline elements (with text inside) only.
 */
function childrenMessage(
  children: Node[],
  taken: Set<string>,
  tagsTaken: Set<string>,
): Message | string {
  const out: Message = { text: "", values: [], tags: [] };
  for (const child of children) {
    const kind = child.getKind();
    if (kind === SyntaxKind.JsxText) {
      out.text += icuText(jsxText((child as JsxText).getFullText()));
      continue;
    }
    if (kind === SyntaxKind.JsxExpression) {
      const expression = child
        .asKindOrThrow(SyntaxKind.JsxExpression)
        .getExpression();
      if (!expression) continue; // a comment
      if (
        expression.getKind() === SyntaxKind.StringLiteral ||
        expression.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
      ) {
        out.text += icuText(
          (
            expression as unknown as { getLiteralValue(): string }
          ).getLiteralValue(),
        );
        continue;
      }
      if (classify(child) === "node") {
        // An icon or other node inside the sentence: an empty tag.
        let name = "icon";
        for (let n = 2; tagsTaken.has(name); n++) name = `icon${n}`;
        tagsTaken.add(name);
        out.tags.push([name, `() => ${expression.getText()}`]);
        out.text += `<${name}></${name}>`;
        continue;
      }
      if (!isSimpleValue(expression))
        return "an {expression} with JSX or a condition";
      const name = argName(expression, taken);
      out.values.push([name, expression.getText()]);
      out.text += `{${name}}`;
      continue;
    }
    if (kind === SyntaxKind.JsxSelfClosingElement) {
      const tag = tagName(child);
      if (BLOCK_ELEMENTS.has(tag) && tag !== "img") return `a <${tag}> inside`;
      let name = tag === "br" ? "br" : /^[A-Z]/.test(tag) ? "icon" : tag;
      name = name.replace(/\W/g, "").toLowerCase();
      for (let n = 2; tagsTaken.has(name); n++)
        name = `${name.replace(/\d+$/, "")}${n}`;
      tagsTaken.add(name);
      out.tags.push([name, `() => ${child.getText()}`]);
      out.text += `<${name}></${name}>`;
      continue;
    }
    if (kind === SyntaxKind.JsxElement) {
      const element = child as JsxElement;
      const tag = tagName(element);
      if (BLOCK_ELEMENTS.has(tag)) return `a <${tag}> inside`;
      const inner = childrenMessage(element.getJsxChildren(), taken, tagsTaken);
      if (typeof inner === "string") return inner;
      let name = /^(?:Link|LocaleLink|a|ExternalLink|TextLink)$/.test(tag)
        ? "link"
        : tag.replace(/\W/g, "").replace(/^./, (c) => c.toLowerCase());
      for (let n = 2; tagsTaken.has(name); n++)
        name = `${name.replace(/\d+$/, "")}${n}`;
      tagsTaken.add(name);
      const opening = element.getOpeningElement().getText();
      const closing = element.getClosingElement().getText();
      out.tags.push(
        [name, `(chunks) => ${opening}{chunks}${closing}`],
        ...inner.tags,
      );
      out.values.push(...inner.values);
      out.text += `<${name}>${inner.text}</${name}>`;
      continue;
    }
    return `a ${child.getKindName()} inside`;
  }
  return out;
}

/** `t("key")`, `t("key", { a })` or `t.rich("key", { a, b: (chunks) => … })`. */
function callText(fn: string, key: string, message: Message): string {
  const entries = [
    ...message.values.map(([name, expression]) =>
      name === expression ? name : `${name}: ${expression}`,
    ),
    ...message.tags.map(([name, render]) => `${name}: ${render}`),
  ];
  const method = message.tags.length > 0 ? `${fn}.rich` : fn;
  return entries.length === 0
    ? `${method}(${JSON.stringify(key)})`
    : `${method}(${JSON.stringify(key)}, { ${entries.join(", ")} })`;
}

interface Edit {
  start: number;
  end: number;
  /** Builds the replacement from the translation function's name. */
  render: (fn: string) => string;
  component: Node;
}

/** Strings in a JSX expression or prop, through conditions and fallbacks. */
function copyLeaves(expression: Node): Node[] | null {
  const kind = expression.getKind();
  if (
    kind === SyntaxKind.StringLiteral ||
    kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
    kind === SyntaxKind.TemplateExpression
  ) {
    return [expression];
  }
  if (kind === SyntaxKind.ParenthesizedExpression) {
    return copyLeaves(
      expression
        .asKindOrThrow(SyntaxKind.ParenthesizedExpression)
        .getExpression(),
    );
  }
  if (kind === SyntaxKind.ConditionalExpression) {
    const conditional = expression.asKindOrThrow(
      SyntaxKind.ConditionalExpression,
    );
    const leaves = [conditional.getWhenTrue(), conditional.getWhenFalse()].map(
      (branch) => copyLeaves(branch) ?? [],
    );
    return leaves.flat();
  }
  if (kind === SyntaxKind.BinaryExpression) {
    const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
    const operator = binary.getOperatorToken().getText();
    if (operator === "??" || operator === "||") {
      return copyLeaves(binary.getRight()) ?? [];
    }
    if (operator === "&&") return copyLeaves(binary.getRight()) ?? [];
  }
  return null;
}

function extract(source: SourceFile): { count: number; text: string } {
  const file = source.getFilePath();
  const namespace = namespaceFor(file);
  const bucket = namespaceObject(namespace);
  const edits: Edit[] = [];
  const covered: [number, number][] = [];
  const isCovered = (node: Node) =>
    covered.some(
      ([start, end]) => node.getStart() >= start && node.getEnd() <= end,
    );
  const report = (node: Node, why: string, text: string) =>
    reports.push({ file, line: node.getStartLineNumber(), why, text });

  /** Queues the replacement of `node` (a string or template) by a message. */
  const queueString = (node: Node, where: "jsx" | "expr") => {
    if (isCovered(node)) return;
    let message: Message | null;
    if (node.getKind() === SyntaxKind.StringLiteral) {
      const raw = node
        .asKindOrThrow(SyntaxKind.StringLiteral)
        .getLiteralValue();
      const text = where === "jsx" ? decode(raw) : raw;
      message = { text: icuText(text), values: [], tags: [] };
    } else {
      message = templateMessage(node);
    }
    const english = node.getText().slice(1, -1);
    if (!(message && isCopy(message.text.replace(/\{\w+\}/g, "")))) return;
    const component = componentOf(node);
    if (!component) {
      report(node, "outside a component", english);
      return;
    }
    const key = keyFor(bucket, message.text);
    const done = message;
    edits.push({
      start: node.getStart(),
      end: node.getEnd(),
      render: (fn) =>
        where === "jsx"
          ? `{${callText(fn, key, done)}}`
          : callText(fn, key, done),
      component,
    });
    covered.push([node.getStart(), node.getEnd()]);
  };

  // 1. Elements whose children are copy. A sentence (text with {values} or
  // inline elements that hold words) becomes one message; text beside icons
  // or blocks is translated on its own.
  const parents = [
    ...source.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...source.getDescendantsOfKind(SyntaxKind.JsxFragment),
  ].sort((a, b) => a.getStart() - b.getStart());
  for (const parent of parents) {
    if (isCovered(parent)) continue;
    if (
      parent.getKind() === SyntaxKind.JsxElement &&
      LITERAL_ELEMENTS.has(tagName(parent))
    ) {
      continue;
    }
    const children = (parent as JsxElement | JsxFragment).getJsxChildren();
    const meaningful = children.filter((child) => {
      if (child.getKind() === SyntaxKind.JsxText) {
        return jsxText(child.getText()).trim() !== "";
      }
      if (child.getKind() === SyntaxKind.JsxExpression) {
        return Boolean(child.asKind(SyntaxKind.JsxExpression)?.getExpression());
      }
      return true;
    });
    const kinds = meaningful.map(classify);
    if (!kinds.includes("text") || inLiteralElement(parent)) continue;
    const component = componentOf(parent);
    const sentence =
      !kinds.includes("complex") &&
      (kinds.includes("value") || kinds.includes("inline"));
    if (!sentence) {
      // Each text on its own.
      meaningful.forEach((text, index) => {
        if (kinds[index] !== "text") return;
        const english = jsxText(text.getText()).trim();
        if (!component) {
          report(text, "outside a component", english);
          return;
        }
        const key = keyFor(bucket, icuText(english));
        const raw = text.getText();
        const lead = spaceBefore(raw);
        const trail = spaceAfter(raw);
        edits.push({
          start: text.getStart(),
          end: text.getEnd(),
          render: (fn) => `${lead}{${fn}(${JSON.stringify(key)})}${trail}`,
          component,
        });
        covered.push([text.getStart(), text.getEnd()]);
      });
      continue;
    }
    // The run: from the first to the last piece of the sentence; icons
    // before or after it stay where they are.
    const firstIndex = kinds.findIndex((kind) => kind !== "node");
    const lastIndex =
      kinds.length -
      1 -
      [...kinds].reverse().findIndex((kind) => kind !== "node");
    // Whitespace between the pieces is part of the sentence.
    const run = children.slice(
      children.indexOf(meaningful[firstIndex] as (typeof children)[number]),
      children.indexOf(meaningful[lastIndex] as (typeof children)[number]) + 1,
    );
    const first = run[0] as Node;
    const last = run.at(-1) as Node;
    const english = run
      .map((node) => node.getText())
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const message = childrenMessage(run, new Set(), new Set());
    if (typeof message === "string") {
      report(first, message, english);
      continue;
    }
    if (!component) {
      report(first, "outside a component", english);
      continue;
    }
    message.text = message.text.trim();
    const key = keyFor(bucket, message.text);
    const lead =
      first.getKind() === SyntaxKind.JsxText
        ? spaceBefore(first.getText())
        : "";
    const trail =
      last.getKind() === SyntaxKind.JsxText ? spaceAfter(last.getText()) : "";
    // Skip whitespace (with newlines) between the run and its neighbours:
    // the replacement starts at the first visible character.
    const start =
      first.getKind() === SyntaxKind.JsxText
        ? first.getStart() +
          (first.getText().length - first.getText().trimStart().length)
        : first.getStart();
    const end =
      last.getKind() === SyntaxKind.JsxText
        ? last.getEnd() -
          (last.getText().length - last.getText().trimEnd().length)
        : last.getEnd();
    const startRaw =
      first.getKind() === SyntaxKind.JsxText ? first.getStart() : start;
    const endRaw = last.getKind() === SyntaxKind.JsxText ? last.getEnd() : end;
    edits.push({
      start: startRaw,
      end: endRaw,
      render: (fn) => `${lead}{${callText(fn, key, message)}}${trail}`,
      component,
    });
    covered.push([first.getStart(), last.getEnd()]);
  }

  // 2. Copy props.
  for (const attribute of source.getDescendantsOfKind(
    SyntaxKind.JsxAttribute,
  )) {
    const name = (attribute as JsxAttribute).getNameNode().getText();
    if (!COPY_ATTRIBUTES.has(name) || isCovered(attribute)) continue;
    const initializer = (attribute as JsxAttribute).getInitializer();
    if (!initializer) continue;
    if (initializer.getKind() === SyntaxKind.StringLiteral) {
      queueString(initializer, "jsx");
      continue;
    }
    const expression = initializer
      .asKind(SyntaxKind.JsxExpression)
      ?.getExpression();
    for (const leaf of (expression && copyLeaves(expression)) ?? []) {
      queueString(leaf, "expr");
    }
  }

  // 3. Strings in JSX child expressions.
  for (const expression of source.getDescendantsOfKind(
    SyntaxKind.JsxExpression,
  )) {
    if (isCovered(expression)) continue;
    const parent = expression.getParent();
    if (parent?.getKind() === SyntaxKind.JsxAttribute) continue;
    const inner = expression.getExpression();
    for (const leaf of (inner && copyLeaves(inner)) ?? [])
      queueString(leaf, "expr");
  }

  // 4. Copy fields of object literals inside components, and toasts.
  for (const property of source.getDescendantsOfKind(
    SyntaxKind.PropertyAssignment,
  )) {
    const name = property
      .getNameNode()
      .getText()
      .replace(/^["']|["']$/g, "");
    if (!COPY_FIELDS.has(name)) continue;
    const initializer = property.getInitializer();
    if (!initializer) continue;
    for (const leaf of copyLeaves(initializer) ?? []) {
      if (componentOf(leaf)) queueString(leaf, "expr");
      else if (!isCovered(leaf)) {
        const text = leaf.getText().slice(1, -1);
        if (isCopy(text)) report(leaf, `module-level ${name}`, text);
      }
    }
  }
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!TOAST.test(call.getExpression().getText())) continue;
    const [message] = call.getArguments();
    for (const leaf of (message && copyLeaves(message)) ?? [])
      queueString(leaf, "expr");
  }

  if (edits.length === 0) return { count: 0, text: source.getFullText() };

  // Each component gets its translation function: `t`, or `tx` where it
  // already has something named t.
  const components = new Map<Node, string>();
  for (const { component } of edits) {
    if (components.has(component)) continue;
    const clash = component
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some((id) => id.getText() === "t");
    components.set(component, clash ? "tx" : "t");
  }
  const insertions: Edit[] = [];
  let needsServer = false;
  let needsClient = false;
  for (const [component, fn] of components) {
    const body = bodyOf(component);
    if (!body) continue;
    const isAsync =
      component.getText().trimStart().startsWith("async") ||
      Boolean((component as ArrowFunction).isAsync?.());
    if (isAsync) needsServer = true;
    else needsClient = true;
    const declaration = isAsync
      ? `const ${fn} = await getTranslations(${JSON.stringify(namespace)});`
      : `const ${fn} = useTranslations(${JSON.stringify(namespace)});`;
    if (body.getKind() === SyntaxKind.Block) {
      const already = (body as Block)
        .getStatements()
        .some((s) => s.getText().startsWith(`const ${fn} = `));
      if (already) continue;
      const open = body.getStart() + 1;
      insertions.push({
        start: open,
        end: open,
        render: () => `\n${declaration}`,
        component,
      });
    } else {
      const start = body.getStart();
      const end = body.getEnd();
      insertions.push(
        {
          start,
          end: start,
          render: () => `{\n${declaration}\nreturn `,
          component,
        },
        { start: end, end, render: () => ";\n}", component },
      );
    }
  }

  let text = source.getFullText();
  const all = [
    ...edits.map((edit) => ({
      ...edit,
      fn: components.get(edit.component) ?? "t",
    })),
    ...insertions.map((edit) => ({ ...edit, fn: "t" })),
  ].sort((a, b) => b.start - a.start || b.end - a.end);
  for (const edit of all) {
    text =
      text.slice(0, edit.start) + edit.render(edit.fn) + text.slice(edit.end);
  }

  const imports: string[] = [];
  if (
    needsClient &&
    !/import \{[^}]*\buseTranslations\b[^}]*\} from "next-intl"/.test(text)
  ) {
    imports.push('import { useTranslations } from "next-intl";');
  }
  if (
    needsServer &&
    !/\bgetTranslations\b[^;]*from "next-intl\/server"/.test(text)
  ) {
    imports.push('import { getTranslations } from "next-intl/server";');
  }
  if (imports.length > 0) {
    const directive =
      /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)(["']use (?:client|server)["'];?\n)?/.exec(
        text,
      );
    const at = directive ? directive[0].length : 0;
    text = `${text.slice(0, at)}${imports.join("\n")}\n${text.slice(at)}`;
  }
  return { count: edits.length, text };
}

const project = new Project({
  tsConfigFilePath: path.join(DOCS, "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
});
let total = 0;
for (const file of files) {
  const source = project.addSourceFileAtPath(path.resolve(file));
  const { count, text } = extract(source);
  total += count;
  console.log(
    `${path.relative(DOCS, source.getFilePath())}: ${count} string(s) → ${namespaceFor(source.getFilePath())}`,
  );
  if (!DRY && count > 0) writeFileSync(source.getFilePath(), text);
}
if (!DRY) writeFileSync(EN, `${JSON.stringify(en, null, 2)}\n`);
for (const { file, line, why, text } of reports) {
  console.log(
    `  by hand: ${path.relative(DOCS, file)}:${line} (${why}) ${JSON.stringify(text.slice(0, 100))}`,
  );
}
console.log(
  `\n${total} string(s) extracted, ${reports.length} left for a person${DRY ? " (dry run)" : ""}`,
);
