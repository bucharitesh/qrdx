/** biome-ignore-all lint/style/noMagicNumbers: spec limits */
// The engine's frame spec parser: frameSpecSchema (frame-spec.ts) without
// zod, so drawing a frame, custom ones included, never loads zod. It accepts
// and rejects exactly what frameSpecSchema does, with the same messages and
// paths in the same order, and returns a copy with the keys in the schema's
// order, as zod does. It follows zod 4's rules for the few kinds of schema a
// spec uses: which checks still run after an issue, which union option
// reports, an oversized array failing before its items are read.
// tests/frame-spec-parse.test.ts compares the two on every official frame
// and thousands of broken specs. Change one, change the other.

import { FRAME_TEXT_MAX_LENGTH } from "./constants";
import type { FrameSpec } from "./frame-spec";
import {
  checkFrameSpec,
  FRAME_COLOR_TOKENS,
  FRAME_ICONS,
  FRAME_SPEC_KIND,
  FRAME_SPEC_LIMITS,
  FRAME_SPEC_VERSION,
  hasPrecision,
} from "./frame-spec-rules";

/** One problem with a spec: where it is, and what's wrong. */
export interface FrameSpecIssue {
  path: (string | number)[];
  message: string;
}

// ── A small schema kit with zod's semantics ───────────────────────────────

interface Issue extends FrameSpecIssue {
  /**
   * zod's `continue`: true lets the schema's later checks run, undefined
   * stops them (except length checks), false stops every one.
   */
  continue?: boolean;
}

interface Payload {
  value: unknown;
  issues: Issue[];
}

interface Check {
  /** Length checks run on any value with a length, even after an issue. */
  hasLength?: true;
  run(payload: Payload): void;
}

interface Schema {
  run(value: unknown): Payload;
  optional?: true;
  /** What a literal accepts (a discriminated union's keys). */
  values?: readonly unknown[];
  shape?: Record<string, Schema>;
}

const stops = (issues: Issue[], from = 0) => {
  for (let i = from; i < issues.length; i++) {
    if (issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
};

/** Runs `parse`, then the checks that may still run (zod's runChecks). */
function schema(
  parse: (payload: Payload) => Payload,
  checks: Check[] = [],
  extra: Omit<Schema, "run"> = {}
): Schema {
  return {
    ...extra,
    run(value) {
      const payload = parse({ value, issues: [] });
      let stopped = stops(payload.issues);
      for (const check of checks) {
        if (check.hasLength) {
          const input = payload.value as { length?: unknown } | null;
          if (
            payload.issues.some((issue) => issue.continue === false) ||
            input === null ||
            input === undefined ||
            input.length === undefined
          ) {
            continue;
          }
        } else if (stopped) {
          continue;
        }
        const start = payload.issues.length;
        check.run(payload);
        if (!stopped && payload.issues.length > start) {
          stopped = stops(payload.issues, start);
        }
      }
      return payload;
    },
  };
}

// zod's English messages
function typeName(input: unknown): string {
  if (typeof input === "number") {
    return Number.isNaN(input)
      ? "NaN"
      : Number.isFinite(input)
        ? "number"
        : String(input);
  }
  if (input === null) {
    return "null";
  }
  if (Array.isArray(input)) {
    return "array";
  }
  if (typeof input === "object") {
    const maker = (input as { constructor?: { name: string } }).constructor;
    if (
      Object.getPrototypeOf(input) !== Object.prototype &&
      "constructor" in input &&
      maker
    ) {
      return maker.name;
    }
  }
  return typeof input;
}

const typeIssue = (expected: string, input: unknown): Issue => ({
  path: [],
  message: `Invalid input: expected ${expected}, received ${typeName(input)}`,
});

const UNITS: Record<string, string> = { string: "characters", array: "items" };

/** too_big or too_small; `more` is the issue's `continue` (see Issue). */
function sizeIssue(
  big: boolean,
  origin: string,
  bound: number,
  more: boolean | undefined
): Issue {
  const unit = UNITS[origin];
  const word = big ? "Too big" : "Too small";
  const limit = `${big ? "<=" : ">="}${bound}`;
  return {
    path: [],
    message: unit
      ? `${word}: expected ${origin} to have ${limit} ${unit}`
      : `${word}: expected ${origin} to be ${limit}`,
    continue: more,
  };
}

const quote = (value: unknown) =>
  typeof value === "string" ? `"${value}"` : `${value}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function prefix(target: Issue[], key: string | number, issues: Issue[]) {
  for (const issue of issues) {
    issue.path.unshift(key);
    target.push(issue);
  }
}

const isHigh = (code: number) => code >= 0xd8_00 && code <= 0xdb_ff;
const isLow = (code: number) => code >= 0xdc_00 && code <= 0xdf_ff;

// Code points: a surrogate pair counts once, a lone surrogate as itself
function codePoints(text: string): number {
  let count = text.length;
  for (let i = 0; i < text.length - 1; i++) {
    if (isHigh(text.charCodeAt(i)) && isLow(text.charCodeAt(i + 1))) {
      count--;
      i++;
    }
  }
  return count;
}

const lengthOrigin = (input: unknown) =>
  Array.isArray(input)
    ? "array"
    : typeof input === "string"
      ? "string"
      : "unknown";

// ── Checks ────────────────────────────────────────────────────────────────

const gte = (minimum: number): Check => ({
  run(payload) {
    if ((payload.value as number) < minimum) {
      payload.issues.push(sizeIssue(false, "number", minimum, true));
    }
  },
});

const lte = (maximum: number): Check => ({
  run(payload) {
    if ((payload.value as number) > maximum) {
      payload.issues.push(sizeIssue(true, "number", maximum, true));
    }
  },
});

const refine = (
  test: (value: number) => boolean,
  message = "Invalid input"
): Check => ({
  run(payload) {
    if (!test(payload.value as number)) {
      payload.issues.push({ path: [], message, continue: true });
    }
  },
});

// A string's length counts code points
const lengthOf = (input: string | unknown[]) =>
  typeof input === "string" ? codePoints(input) : input.length;

const minLength = (minimum: number): Check => ({
  hasLength: true,
  run(payload) {
    const input = payload.value as string | unknown[];
    if (lengthOf(input) < minimum) {
      payload.issues.push(sizeIssue(false, lengthOrigin(input), minimum, true));
    }
  },
});

const maxLength = (maximum: number): Check => ({
  hasLength: true,
  run(payload) {
    const input = payload.value as string | unknown[];
    if (lengthOf(input) > maximum) {
      payload.issues.push(sizeIssue(true, lengthOrigin(input), maximum, true));
    }
  },
});

const regex = (pattern: RegExp, message?: string): Check => ({
  run(payload) {
    pattern.lastIndex = 0;
    if (!pattern.test(payload.value as string)) {
      payload.issues.push({
        path: [],
        message: message ?? `Invalid string: must match pattern ${pattern}`,
        continue: true,
      });
    }
  },
});

// z.int(): a whole number within the safe range, checked before the rest
const integer: Check = {
  run(payload) {
    const input = payload.value as number;
    if (!Number.isInteger(input)) {
      payload.issues.push({ ...typeIssue("int", input), continue: false });
    } else if (!Number.isSafeInteger(input)) {
      payload.issues.push(
        input > 0
          ? sizeIssue(true, "int", Number.MAX_SAFE_INTEGER, true)
          : sizeIssue(false, "int", Number.MIN_SAFE_INTEGER, true)
      );
    }
  },
};

// ── Schemas ───────────────────────────────────────────────────────────────

const number = (...checks: Check[]) =>
  schema((payload) => {
    const input = payload.value;
    if (!(typeof input === "number" && Number.isFinite(input))) {
      payload.issues.push(typeIssue("number", input));
    }
    return payload;
  }, checks);

const int = (...checks: Check[]) => number(integer, ...checks);

const string = (...checks: Check[]) =>
  schema((payload) => {
    if (typeof payload.value !== "string") {
      payload.issues.push(typeIssue("string", payload.value));
    }
    return payload;
  }, checks);

function oneOf(values: readonly unknown[]): Schema {
  const message =
    values.length === 1
      ? `Invalid input: expected ${quote(values[0])}`
      : `Invalid option: expected one of ${values.map(quote).join("|")}`;
  return schema(
    (payload) => {
      if (!values.includes(payload.value)) {
        payload.issues.push({ path: [], message });
      }
      return payload;
    },
    [],
    { values }
  );
}

const literal = (value: string | number) => oneOf([value]);

const optional = (inner: Schema): Schema => ({
  optional: true,
  run: (value) =>
    value === undefined ? { value, issues: [] } : inner.run(value),
});

/** An object with exactly these keys (z.object(shape).strict()). */
function strict(shape: Record<string, Schema>, checks: Check[] = []): Schema {
  const keys = Object.keys(shape);
  const known = new Set(keys);
  return schema(
    (payload) => {
      const input = payload.value;
      if (!isObject(input)) {
        payload.issues.push(typeIssue("object", input));
        return payload;
      }
      const output: Record<string, unknown> = {};
      for (const key of keys) {
        const field = shape[key] as Schema;
        const result = field.run(input[key]);
        const present = key in input;
        // (An absent optional field never has issues: it's undefined.)
        prefix(payload.issues, key, result.issues);
        if (!(present || field.optional || result.issues.length > 0)) {
          payload.issues.push({
            path: [key],
            message: "Invalid input: expected nonoptional, received undefined",
          });
        }
        if (present) {
          output[key] = result.value;
        }
      }
      payload.value = output;
      const unknown: string[] = [];
      // biome-ignore lint/suspicious/noForIn: zod lists inherited enumerable keys too
      for (const key in input) {
        if (!known.has(key)) {
          unknown.push(key);
        }
      }
      if (unknown.length > 0) {
        payload.issues.push({
          path: [],
          message: `Unrecognized key${unknown.length > 1 ? "s" : ""}: ${unknown.map(quote).join(", ")}`,
          continue: true,
        });
      }
      return payload;
    },
    checks,
    { shape }
  );
}

function array(item: Schema, minimum?: number, maximum?: number): Schema {
  const checks: Check[] = [];
  if (minimum !== undefined) {
    checks.push(minLength(minimum));
  }
  if (maximum !== undefined) {
    checks.push(maxLength(maximum));
  }
  return schema((payload) => {
    const input = payload.value;
    // An oversized array fails before any item is read
    if (
      Array.isArray(input) &&
      maximum !== undefined &&
      input.length > maximum
    ) {
      payload.issues.push(sizeIssue(true, "array", maximum, false));
      return payload;
    }
    if (!Array.isArray(input)) {
      payload.issues.push(typeIssue("array", input));
      return payload;
    }
    const output: unknown[] = new Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const result = item.run(input[i]);
      prefix(payload.issues, i, result.issues);
      output[i] = result.value;
    }
    payload.value = output;
    return payload;
  }, checks);
}

function tuple(items: Schema[]): Schema {
  return schema((payload) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push(typeIssue("tuple", input));
      return payload;
    }
    if (input.length < items.length) {
      payload.issues.push(sizeIssue(false, "array", items.length, undefined));
      return payload;
    }
    if (input.length > items.length) {
      payload.issues.push(sizeIssue(true, "array", items.length, undefined));
    }
    const output: unknown[] = [];
    items.forEach((item, i) => {
      const result = item.run(input[i]);
      prefix(payload.issues, i, result.issues);
      output[i] = result.value;
    });
    payload.value = output;
    return payload;
  });
}

/** The first option that passes; else the one that failed softly; else one issue. */
function union(options: Schema[]): Schema {
  return schema((payload) => {
    const results: Payload[] = [];
    for (const option of options) {
      const result = option.run(payload.value);
      if (result.issues.length === 0) {
        return result;
      }
      results.push(result);
    }
    const soft = results.filter((result) => !stops(result.issues));
    if (soft.length === 1) {
      return soft[0] as Payload;
    }
    payload.issues.push({ path: [], message: "Invalid input" });
    return payload;
  });
}

/** The option whose `key` literal matches (z.discriminatedUnion). */
function discriminated(key: string, options: Schema[]): Schema {
  const byValue = new Map<unknown, Schema>();
  for (const option of options) {
    for (const value of option.shape?.[key]?.values ?? []) {
      byValue.set(value, option);
    }
  }
  const message = `Invalid discriminator value. Expected ${[...byValue.keys()]
    .map((value) => `'${value}'`)
    .join(" | ")}`;
  return schema((payload) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push(typeIssue("object", input));
      return payload;
    }
    const option = byValue.get(input[key]);
    if (option) {
      return option.run(input);
    }
    payload.issues.push({ path: [key], message });
    return payload;
  });
}

// ── The spec (in step with frame-spec.ts) ─────────────────────────────────

const precise = refine(
  hasPrecision,
  `Numbers may have at most ${FRAME_SPEC_LIMITS.maxDecimals} decimals`
);
const coordinate = [
  gte(-FRAME_SPEC_LIMITS.maxCoordinate),
  lte(FRAME_SPEC_LIMITS.maxCoordinate),
  precise,
];
const num = number(...coordinate);
const positive = number(
  ...coordinate,
  refine((value) => value > 0, "Must be greater than 0")
);
const nonNegative = number(
  ...coordinate,
  refine((value) => value >= 0, "Must not be negative")
);

const hexColor = string(
  regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a #rgb or #rrggbb color")
);
const baseColor = union([oneOf(FRAME_COLOR_TOKENS), hexColor]);
const mix = (base: Schema) =>
  strict({
    mix: tuple([base, base]),
    amount: number(gte(0), lte(1), refine(hasPrecision)),
  });
const color = union([baseColor, mix(baseColor)]);
const defaultTextColor = union([
  hexColor,
  mix(union([oneOf(["frame", "accent", "background"]), hexColor])),
]);
const paint = union([
  color,
  strict({
    gradient: strict({
      from: color,
      to: color,
      direction: optional(oneOf(["horizontal", "vertical"])),
      steps: optional(int(gte(2), lte(FRAME_SPEC_LIMITS.maxGradientSteps))),
    }),
  }),
]);

const box = () => ({ x: num, y: num, width: positive, height: positive });
const stroke = strict({ color, width: positive });

const shape = discriminated("type", [
  strict({
    type: literal("rect"),
    ...box(),
    radius: optional(nonNegative),
    fill: paint,
    hole: optional(strict({ ...box(), radius: optional(nonNegative) })),
    stroke: optional(stroke),
  }),
  strict({
    type: literal("circle"),
    cx: num,
    cy: num,
    r: positive,
    hole: optional(positive),
    fill: paint,
    stroke: optional(stroke),
  }),
  strict({
    type: literal("ellipse"),
    cx: num,
    cy: num,
    rx: positive,
    ry: positive,
    fill: paint,
    stroke: optional(stroke),
  }),
  strict({
    type: literal("polygon"),
    points: array(tuple([num, num]), 3, FRAME_SPEC_LIMITS.maxPolygonPoints),
    fill: paint,
    stroke: optional(stroke),
  }),
  strict({
    type: literal("path"),
    d: string(minLength(2), maxLength(FRAME_SPEC_LIMITS.maxPathLength)),
    fill: paint,
    fillRule: optional(oneOf(["nonzero", "evenodd"])),
    stroke: optional(stroke),
  }),
  strict({
    type: literal("line"),
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    width: positive,
    cap: optional(oneOf(["butt", "round"])),
    dash: optional(tuple([positive, positive])),
    fill: paint,
  }),
  strict({
    type: literal("icon"),
    icon: oneOf(FRAME_ICONS),
    x: num,
    y: num,
    size: positive,
    fill: paint,
  }),
]);

const labelFields = () => ({
  id: string(regex(/^[a-z][a-z0-9-]{0,31}$/)),
  slot: oneOf(["primary", "secondary", "fixed"]),
  text: string(maxLength(200)),
  maxLength: optional(int(gte(1), lte(FRAME_TEXT_MAX_LENGTH))),
  color,
  weight: optional(oneOf(["bold", "regular"])),
  collapse: optional(strict({ y: num, height: positive })),
});

const label = discriminated("type", [
  strict({
    type: literal("text"),
    ...labelFields(),
    box: strict(box()),
    align: optional(oneOf(["start", "middle", "end"])),
    fontSize: optional(positive),
  }),
  strict({
    type: literal("curved"),
    ...labelFields(),
    curve: strict({
      cx: num,
      cy: num,
      radius: positive,
      side: oneOf(["top", "bottom"]),
      spread: optional(number(gte(20), lte(300), refine(hasPrecision))),
    }),
    fontSize: positive,
  }),
]);

const artboardSide = number(
  ...coordinate,
  refine(
    (value) =>
      value >= FRAME_SPEC_LIMITS.minArtboard &&
      value <= FRAME_SPEC_LIMITS.maxArtboard,
    `Artboard sides must be ${FRAME_SPEC_LIMITS.minArtboard} to ${FRAME_SPEC_LIMITS.maxArtboard} units`
  )
);

const frameSpec = strict(
  {
    kind: literal(FRAME_SPEC_KIND),
    version: literal(FRAME_SPEC_VERSION),
    artboard: strict({ width: artboardSide, height: artboardSide }),
    qr: strict({
      x: num,
      y: num,
      size: positive,
      padding: optional(nonNegative),
      radius: optional(nonNegative),
      plate: optional(oneOf(["opaque", "background", "none"])),
    }),
    colors: strict({
      frame: hexColor,
      text: optional(defaultTextColor),
      accent: optional(hexColor),
    }),
    shapes: array(shape, undefined, FRAME_SPEC_LIMITS.maxShapes),
    labels: array(label, undefined, FRAME_SPEC_LIMITS.maxLabels),
    bleed: optional(union([literal("none"), color])),
  },
  [
    {
      run(payload) {
        checkFrameSpec(payload.value as FrameSpec, (message, path = []) => {
          payload.issues.push({ path: [...path], message, continue: true });
        });
      },
    },
  ]
);

/**
 * Parses `input` as a frame spec with every limit and check: a copy of it,
 * or the problems. What `frameSpecSchema.safeParse` gives, without zod.
 */
export function parseFrameSpec(
  input: unknown
):
  | { success: true; data: FrameSpec }
  | { success: false; issues: FrameSpecIssue[] } {
  const result = frameSpec.run(input);
  if (result.issues.length === 0) {
    return { success: true, data: result.value as FrameSpec };
  }
  return {
    success: false,
    issues: result.issues.map(({ path, message }) => ({ path, message })),
  };
}

/** An issue as one line: `shapes.0.fill: Invalid input`. */
export const frameSpecIssueText = ({ path, message }: FrameSpecIssue) =>
  path.length > 0 ? `${path.join(".")}: ${message}` : message;
