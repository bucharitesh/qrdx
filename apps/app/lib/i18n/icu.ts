// A small ICU MessageFormat reader for checking translations against the
// English source: which arguments and rich-text tags a message uses, and
// the literal text outside them. Follows next-intl's syntax (intl-
// messageformat): {name}, {name, number}, {n, plural, one {…} other {…}},
// {x, select, …}, <tag>…</tag>, with '' and '{…}' quoting.

export interface IcuShape {
  /** Argument names, sorted and unique. */
  args: string[];
  /** Rich-text tag names, sorted and unique. */
  tags: string[];
  /** The literal text, with arguments, tags and plural # left out. */
  text: string;
}

const NESTED_TYPES = new Set(["plural", "selectordinal", "select"]);

class Reader {
  i = 0;
  readonly args = new Set<string>();
  readonly tags = new Set<string>();
  readonly text: string[] = [];

  constructor(readonly source: string) {}

  fail(message: string): never {
    throw new Error(`${message} at ${this.i} in "${this.source}"`);
  }

  skipSpace() {
    while (/\s/.test(this.source[this.i] ?? "")) this.i++;
  }

  word(): string {
    this.skipSpace();
    const start = this.i;
    while (
      this.i < this.source.length &&
      !/[\s,{}]/.test(this.source[this.i] as string)
    ) {
      this.i++;
    }
    if (start === this.i) this.fail("Expected a name");
    return this.source.slice(start, this.i);
  }

  /** Message text until an unmatched "}" (nested) or the end. */
  message(inPlural: boolean, closingTag?: string) {
    const { source } = this;
    while (this.i < source.length) {
      const char = source[this.i] as string;
      if (char === "}") {
        if (closingTag) this.fail(`Unclosed <${closingTag}>`);
        return;
      }
      if (char === "{") {
        this.argument();
        continue;
      }
      if (char === "#" && inPlural) {
        this.i++;
        continue;
      }
      if (char === "<") {
        const close = /^<\/([a-zA-Z][\w-]*)>/.exec(source.slice(this.i));
        if (close) {
          if (close[1] !== closingTag) this.fail(`Unexpected </${close[1]}>`);
          this.i += close[0].length;
          return;
        }
        const open = /^<([a-zA-Z][\w-]*)>/.exec(source.slice(this.i));
        if (open) {
          const name = open[1] as string;
          this.tags.add(name);
          this.i += open[0].length;
          this.message(inPlural, name);
          continue;
        }
      }
      if (char === "'") {
        const next = source[this.i + 1];
        if (next === "'") {
          this.text.push("'");
          this.i += 2;
          continue;
        }
        if (
          next === "{" ||
          next === "}" ||
          next === "<" ||
          (inPlural && next === "#")
        ) {
          const end = source.indexOf("'", this.i + 1);
          if (end === -1) this.fail("Unclosed quote");
          this.text.push(source.slice(this.i + 1, end));
          this.i = end + 1;
          continue;
        }
      }
      this.text.push(char);
      this.i++;
    }
    if (closingTag) this.fail(`Unclosed <${closingTag}>`);
  }

  argument() {
    this.i++; // {
    const name = this.word();
    this.args.add(name);
    this.skipSpace();
    if (this.source[this.i] === "}") {
      this.i++;
      return;
    }
    if (this.source[this.i] !== ",") this.fail("Expected , or }");
    this.i++;
    const type = this.word();
    this.skipSpace();
    if (!NESTED_TYPES.has(type)) {
      // number, date, time and their styles: skip to the closing brace.
      const end = this.source.indexOf("}", this.i);
      if (end === -1) this.fail("Unclosed argument");
      this.i = end + 1;
      return;
    }
    if (this.source[this.i] !== ",") this.fail("Expected , after the type");
    this.i++;
    let options = 0;
    for (;;) {
      this.skipSpace();
      if (this.source[this.i] === "}") {
        this.i++;
        break;
      }
      const selector = this.word();
      if (selector.startsWith("offset:")) continue;
      this.skipSpace();
      if (this.source[this.i] !== "{")
        this.fail(`Expected { after ${selector}`);
      this.i++;
      this.message(type !== "select");
      if (this.source[this.i] !== "}") this.fail("Unclosed option");
      this.i++;
      options++;
    }
    if (options === 0) this.fail(`No options in ${name}`);
  }
}

/** Throws on a syntax error (unbalanced braces or tags). */
export function icuShape(message: string): IcuShape {
  const reader = new Reader(message);
  reader.message(false);
  if (reader.i < message.length) reader.fail("Unexpected }");
  return {
    args: [...reader.args].sort(),
    tags: [...reader.tags].sort(),
    text: reader.text.join(""),
  };
}

/** Numbers written out in the literal text ("12", "25", "18004"), sorted. */
export function literalNumbers(message: string): string[] {
  return (icuShape(message).text.match(/\d+/g) ?? []).sort();
}

/** Why `translation` doesn't fit `source`, or null when it does. */
export function shapeMismatch(
  source: string,
  translation: string,
): string | null {
  let a: IcuShape;
  let b: IcuShape;
  try {
    a = icuShape(source);
  } catch (error) {
    return `English source: ${(error as Error).message}`;
  }
  try {
    b = icuShape(translation);
  } catch (error) {
    return (error as Error).message;
  }
  if (a.args.join() !== b.args.join()) {
    return `arguments {${a.args.join(", ")}} became {${b.args.join(", ")}}`;
  }
  if (a.tags.join() !== b.tags.join()) {
    return `tags <${a.tags.join(", ")}> became <${b.tags.join(", ")}>`;
  }
  return numberMismatch(a.text, b.text);
}

/**
 * Every number the English states appears in the translation: nothing
 * dropped or invented in a figure (honest copy). For plain text (no ICU),
 * such as lib/i18n/content.ts strings.
 */
export function numberMismatch(
  source: string,
  translation: string,
): string | null {
  const theirs = new Set(translation.match(/\d+/g) ?? []);
  for (const number of source.match(/\d+/g) ?? []) {
    if (!theirs.has(number)) return `the number ${number} is missing`;
  }
  return null;
}
