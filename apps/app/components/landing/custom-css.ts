// Custom CSS for hosted pages (Business). Owners write plain CSS; it is
// validated on save and re-scoped on render so it can only style the page's
// own content:
// - every selector is prefixed with the page scope (descendants only), and a
//   selector may not start with a sibling combinator or use `&` nesting;
// - only @media, @supports, @container and @keyframes at-rules are allowed;
// - no external resources (url(), image-set(), @import, @font-face) and no
//   legacy script hooks (expression(), behavior, -moz-binding);
// - no `<` or backslash escapes, so the result is safe inside <style>.
// The renderer gives the scope element `contain: paint`, so even fixed or
// absolutely positioned content can't cover the "Report abuse" link.

export const MAX_CUSTOM_CSS_LENGTH = 10_000;
export const CUSTOM_CSS_SCOPE = "[data-qrdx-page]";

const NESTING_AT_RULES = new Set(["media", "supports", "container"]);
const KEYFRAMES_AT_RULES = new Set(["keyframes", "-webkit-keyframes"]);

const FORBIDDEN: Array<[RegExp, string]> = [
  [/</, "The character < is not allowed"],
  [/\\/, "Backslash escapes are not allowed"],
  [/\burl\s*\(/i, "url() is not allowed: custom CSS can't load files"],
  [/image-set\s*\(/i, "image-set() is not allowed"],
  [/\bsrc\s*\(/i, "src() is not allowed"],
  [/expression\s*\(/i, "expression() is not allowed"],
  [/javascript\s*:/i, "javascript: is not allowed"],
  [/vbscript\s*:/i, "vbscript: is not allowed"],
  [/\bbehavior\s*:/i, "behavior is not allowed"],
  [/-moz-binding/i, "-moz-binding is not allowed"],
];

export type CustomCssResult =
  | { ok: true; css: string }
  | { ok: false; error: string };

class CssError extends Error {}

/** Index of the next top-level `stop` character, skipping strings, (), []. */
function scanUntil(text: string, from: number, stops: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const char = text[i] as string;
    if (quote) {
      if (char === quote) quote = null;
      else if (char === "\n") throw new CssError("Unterminated string");
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0 && stops.includes(char)) return i;
  }
  if (quote) throw new CssError("Unterminated string");
  return -1;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const index = scanUntil(text, start, separator);
    if (index === -1) {
      parts.push(text.slice(start));
      return parts;
    }
    parts.push(text.slice(start, index));
    start = index + 1;
  }
}

function scopeSelector(selectorList: string, scope: string): string {
  return splitTopLevel(selectorList, ",")
    .map((raw) => {
      const selector = raw.trim().replace(/\s+/g, " ");
      if (!selector) throw new CssError("Empty selector");
      if (selector.includes("&")) {
        throw new CssError("Nested selectors (&) are not supported");
      }
      if (/^[~+]/.test(selector)) {
        throw new CssError(`Selector "${selector}" can't start with ~ or +`);
      }
      return `${scope} ${selector}`;
    })
    .join(", ");
}

function readDeclarations(text: string, from: number): [string, number] {
  const end = scanUntil(text, from, "{}");
  if (end === -1) throw new CssError("Missing }");
  if (text[end] === "{") {
    throw new CssError("Nested rules are not supported");
  }
  const body = splitTopLevel(text.slice(from, end), ";")
    .map((declaration) => declaration.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((declaration) => {
      if (
        !/^(?:--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9-]*)\s*:/.test(declaration)
      ) {
        throw new CssError(`Invalid declaration "${declaration.slice(0, 40)}"`);
      }
      return declaration;
    })
    .join("; ");
  return [body, end + 1];
}

function parseRules(
  text: string,
  from: number,
  scope: string | null,
  nested: boolean,
): [string[], number] {
  const out: string[] = [];
  let i = from;
  for (;;) {
    while (i < text.length && /\s/.test(text[i] as string)) i++;
    if (i >= text.length) {
      if (nested) throw new CssError("Missing }");
      return [out, i];
    }
    if (text[i] === "}") {
      if (!nested) throw new CssError("Unexpected }");
      return [out, i + 1];
    }

    if (text[i] === "@") {
      const name = /^@([a-zA-Z-]+)/.exec(text.slice(i))?.[1]?.toLowerCase();
      if (!name) throw new CssError("Invalid at-rule");
      const open = scanUntil(text, i, "{;}");
      if (open === -1 || text[open] !== "{") {
        throw new CssError(`@${name} is not allowed`);
      }
      const prelude = text
        .slice(i + name.length + 1, open)
        .trim()
        .replace(/\s+/g, " ");
      if (NESTING_AT_RULES.has(name) && scope) {
        const [children, next] = parseRules(text, open + 1, scope, true);
        out.push(`@${name} ${prelude} { ${children.join(" ")} }`);
        i = next;
      } else if (KEYFRAMES_AT_RULES.has(name) && scope) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(prelude)) {
          throw new CssError("Invalid @keyframes name");
        }
        const [frames, next] = parseRules(text, open + 1, null, true);
        out.push(`@${name} ${prelude} { ${frames.join(" ")} }`);
        i = next;
      } else {
        throw new CssError(`@${name} is not allowed`);
      }
      continue;
    }

    const open = scanUntil(text, i, "{};");
    if (open === -1 || text[open] !== "{") {
      throw new CssError("Expected a selector followed by {");
    }
    const rawSelector = text.slice(i, open);
    const selector = scope
      ? scopeSelector(rawSelector, scope)
      : rawSelector.trim();
    if (
      !scope &&
      !/^(?:from|to|\d{1,3}(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d{1,3}(?:\.\d+)?%))*$/i.test(
        selector,
      )
    ) {
      throw new CssError(`Invalid keyframe selector "${selector}"`);
    }
    const [body, next] = readDeclarations(text, open + 1);
    out.push(`${selector} { ${body} }`);
    i = next;
  }
}

/**
 * Validates owner CSS and rewrites it so every rule applies only inside
 * `scope`. Returns a user-facing error for anything outside the safe subset.
 */
export function scopeCustomCss(
  input: string,
  scope: string = CUSTOM_CSS_SCOPE,
): CustomCssResult {
  if (input.length > MAX_CUSTOM_CSS_LENGTH) {
    return {
      ok: false,
      error: `Custom CSS can be up to ${MAX_CUSTOM_CSS_LENGTH.toLocaleString("en-US")} characters`,
    };
  }
  const css = input.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  for (const [pattern, error] of FORBIDDEN) {
    if (pattern.test(css)) return { ok: false, error };
  }
  try {
    const [rules] = parseRules(css, 0, scope, false);
    return { ok: true, css: rules.join("\n") };
  } catch (error) {
    if (error instanceof CssError) return { ok: false, error: error.message };
    throw error;
  }
}
