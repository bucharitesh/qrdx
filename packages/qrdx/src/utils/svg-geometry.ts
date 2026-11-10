/** biome-ignore-all lint/style/noMagicNumbers: geometry */
// Minimal SVG reader for the markup this library renders: parses the element
// tree, transforms and path data into absolute move/line/cubic segments.

export interface SvgNode {
  name: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code =
        entity[1].toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      // Out-of-range code points and lone surrogates stay as written
      // (String.fromCodePoint would throw on the first).
      return Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10_ff_ff &&
        !(code >= 0xd8_00 && code <= 0xdf_ff)
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// The reader below tokenizes markup exactly as matchAll did with this regex,
// but in linear time; the regex backtracked polynomially on hostile input
// (8 KB of "<!--" took over 30 seconds):
//
//   <!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|
//   <\/([^\s>]+)\s*>|<([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)
//
// tests/svg-geometry.test.ts keeps the regex reader and compares the two.

const LT = 60;
const GT = 62;
const SLASH = 47;
const EQUALS = 61;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;

// Runs of one character class: one greedy pass each, nothing to backtrack.
const SPACE_RUN = /\s*/y;
const OPEN_NAME_RUN = /[^\s/>]*/y;
const CLOSE_NAME_RUN = /[^\s>]*/y;
const ATTR_NAME_RUN = /[^\s=]*/y;

/** Where the run of `run`'s characters starting at `from` ends. */
function runEnd(run: RegExp, text: string, from: number): number {
  run.lastIndex = from;
  return run.test(text) ? run.lastIndex : from;
}

interface MarkupHandler {
  open(name: string, rawAttrs: string, selfClosing: boolean): void;
  close(): void;
  text(text: string): void;
  cdata(text: string): void;
}

/**
 * Splits markup into the regex's tokens, in order. Comments, processing
 * instructions and declarations produce no call. A "<" that starts no token
 * is skipped, and the text after it becomes a text token.
 */
function tokenizeMarkup(markup: string, on: MarkupHandler): void {
  const n = markup.length;

  // indexOf for searches whose start only moves forward: a hit at or after
  // the new start, or no hit at all, still answers the next search.
  const finder = (needle: string) => {
    let from = Number.POSITIVE_INFINITY;
    let found = -1;
    return (start: number): number => {
      if (start < from || (found >= 0 && found < start)) {
        from = start;
        found = markup.indexOf(needle, start);
      }
      return found;
    };
  };
  const commentEnd = finder("-->");
  const instructionEnd = finder("?>");
  const cdataEnd = finder("]]>");
  const declarationEnd = finder(">");

  // An open tag's attributes are a walk over boundaries: a quote jumps past
  // its closing quote, any other character steps one on, and the walk stops
  // at "/>" or ">" (returning its index) or fails at the end of the markup
  // or at a quote that never closes. Where a walk goes depends only on where
  // it is, so every boundary a failed walk crossed fails for later walks
  // too. Marking them keeps all walks together linear.
  let failed: Uint8Array | undefined;
  const nextBoundary = (at: number): number => {
    const code = markup.charCodeAt(at);
    if (code !== DOUBLE_QUOTE && code !== SINGLE_QUOTE) {
      return at + 1;
    }
    const close = markup.indexOf(markup[at] as string, at + 1);
    return close < 0 ? n : close + 1;
  };
  const walk = (start: number): number => {
    for (let at = start; at < n && !failed?.[at]; at = nextBoundary(at)) {
      const code = markup.charCodeAt(at);
      if (code === GT || (code === SLASH && markup.charCodeAt(at + 1) === GT)) {
        return at;
      }
    }
    failed ??= new Uint8Array(n);
    for (let at = start; at < n && !failed[at]; at = nextBoundary(at)) {
      failed[at] = 1;
    }
    return -1;
  };

  // The name is the run of [^\s/>] after "<", but the regex gave characters
  // back from its end when the attributes could not be read from there. So
  // it ends at the last place a walk succeeds from: the run's end, or a
  // quote inside the run (from anywhere else the walk steps forward to the
  // next quote or the run's end anyway). That depends only on the run, so a
  // "<" later in the same run reuses the answer.
  let nameFrom = -1;
  let nameRunEnd = -1;
  let nameEnd = -1;
  let openEnd = -1;
  const openTag = (lt: number): number => {
    const from = lt + 1;
    if (from < nameFrom || from >= nameRunEnd) {
      nameFrom = from;
      nameRunEnd = runEnd(OPEN_NAME_RUN, markup, from);
      nameEnd = -1;
      for (let at = nameRunEnd; at > from; at--) {
        const code = markup.charCodeAt(at);
        if (
          at === nameRunEnd ||
          code === DOUBLE_QUOTE ||
          code === SINGLE_QUOTE
        ) {
          openEnd = walk(at);
          if (openEnd >= 0) {
            nameEnd = at;
            break;
          }
        }
      }
    }
    // The name needs at least one character.
    if (nameEnd <= from) {
      return -1;
    }
    const selfClosing = markup.charCodeAt(openEnd) === SLASH;
    on.open(
      markup.slice(from, nameEnd),
      markup.slice(nameEnd, openEnd),
      selfClosing
    );
    return openEnd + (selfClosing ? 2 : 1);
  };

  // "</name>": the run of [^\s>] after "</", optional space, then ">". A "<"
  // later in the same run reuses the answer.
  let closeFrom = -1;
  let closeRunEnd = -1;
  let closeEnd = -1;
  const closeTag = (lt: number): number => {
    const from = lt + 2;
    if (from < closeFrom || from >= closeRunEnd) {
      closeFrom = from;
      closeRunEnd = runEnd(CLOSE_NAME_RUN, markup, from);
      const gt = runEnd(SPACE_RUN, markup, closeRunEnd);
      closeEnd = closeRunEnd > from && markup.charCodeAt(gt) === GT ? gt : -1;
    }
    return closeEnd;
  };

  /** The end of the token starting at the "<" at `lt`, or -1 for none. */
  const tagAt = (lt: number): number => {
    if (markup.startsWith("<!--", lt)) {
      const end = commentEnd(lt + 4);
      if (end >= 0) {
        return end + 3;
      }
    }
    if (markup.startsWith("<?", lt)) {
      const end = instructionEnd(lt + 2);
      if (end >= 0) {
        return end + 2;
      }
    }
    if (markup.startsWith("<![CDATA[", lt)) {
      const end = cdataEnd(lt + 9);
      if (end >= 0) {
        on.cdata(markup.slice(lt + 9, end));
        return end + 3;
      }
    }
    if (markup.startsWith("<!", lt)) {
      const end = declarationEnd(lt + 2);
      if (end >= 0) {
        return end + 1;
      }
    }
    if (markup.charCodeAt(lt + 1) === SLASH) {
      // "/" can't start an open tag's name either.
      const end = closeTag(lt);
      if (end < 0) {
        return -1;
      }
      on.close();
      return end + 1;
    }
    return openTag(lt);
  };

  let at = 0;
  while (at < n) {
    if (markup.charCodeAt(at) === LT) {
      const end = tagAt(at);
      at = end < 0 ? at + 1 : end;
    } else {
      const lt = markup.indexOf("<", at);
      const end = lt < 0 ? n : lt;
      on.text(markup.slice(at, end));
      at = end;
    }
  }
}

/**
 * Reads `name="value"` pairs as /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
 * did with matchAll, in linear time (the regex retried from every character
 * of a long name that no "=" followed).
 */
function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let at = 0;
  while (at < raw.length) {
    const nameEnd = runEnd(ATTR_NAME_RUN, raw, at);
    if (nameEnd === at) {
      at++;
      continue;
    }
    const equals = runEnd(SPACE_RUN, raw, nameEnd);
    if (raw.charCodeAt(equals) === EQUALS) {
      const open = runEnd(SPACE_RUN, raw, equals + 1);
      const quote = raw[open];
      const close =
        quote === '"' || quote === "'" ? raw.indexOf(quote, open + 1) : -1;
      if (close >= 0) {
        attrs[raw.slice(at, nameEnd)] = decodeEntities(
          raw.slice(open + 1, close)
        );
        at = close + 1;
        continue;
      }
    }
    // A pair starting later in this name would fail the same way.
    at = nameEnd;
  }
  return attrs;
}

/** Parses SVG/XML markup into a tree and returns the first `<svg>` element. */
export function parseSvgMarkup(markup: string): SvgNode | null {
  const root: SvgNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: SvgNode[] = [root];
  const current = () => stack.at(-1) as SvgNode;

  tokenizeMarkup(markup, {
    open(name, rawAttrs, selfClosing) {
      const attrs = parseAttributes(rawAttrs);
      const node: SvgNode = { name, attrs, children: [], text: "" };
      current().children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
    },
    close() {
      if (stack.length > 1) {
        stack.pop();
      }
    },
    text(text) {
      current().text += decodeEntities(text);
    },
    cdata(text) {
      current().text += text;
    },
  });

  const findSvg = (node: SvgNode): SvgNode | null => {
    for (const child of node.children) {
      if (child.name === "svg") {
        return child;
      }
      const found = findSvg(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return findSvg(root);
}

// ── Matrices ───────────────────────────────────────────────────────────────

/** Affine matrix [a, b, c, d, e, f] as in SVG `matrix()` */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Returns `m1 × m2` (m2 is applied first). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Average linear scale of a matrix (for stroke widths and font sizes). */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export function parseNumbers(value: string | undefined): number[] {
  if (!value) {
    return [];
  }
  return (value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(
    Number
  );
}

/** Parses an SVG `transform` attribute into a single matrix. */
export function parseTransform(value: string | undefined): Matrix {
  let result: Matrix = IDENTITY;
  if (!value) {
    return result;
  }
  for (const [, name, args] of value.matchAll(
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  )) {
    const n = parseNumbers(args);
    let t: Matrix = IDENTITY;
    switch (name) {
      case "matrix":
        if (n.length === 6) {
          t = n as Matrix;
        }
        break;
      case "translate":
        t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case "scale":
        t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const angle = ((n[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
        t = multiply(
          multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]),
          [1, 0, 0, 1, -cx, -cy]
        );
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        break;
    }
    result = multiply(result, t);
  }
  return result;
}

// ── Paths ──────────────────────────────────────────────────────────────────

export type Segment =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | {
      op: "C";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { op: "Z" };

const NUMBER_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): Segment[] {
  if (x1 === x2 && y1 === y2) {
    return [];
  }
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return [{ op: "L", x: x2, y: y2 }];
  }
  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator =
    rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef =
    (largeArc === sweep ? -1 : 1) *
    Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry
  );
  if (!sweep && delta > 0) {
    delta -= 2 * Math.PI;
  } else if (sweep && delta < 0) {
    delta += 2 * Math.PI;
  }

  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count;
  const t = (4 / 3) * Math.tan(step / 4);
  const map = (px: number, py: number): [number, number] => [
    cx + rx * cosPhi * px - ry * sinPhi * py,
    cy + rx * sinPhi * px + ry * cosPhi * py,
  ];

  const segments: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const a = theta1 + i * step;
    const b = a + step;
    const [c1x, c1y] = map(
      Math.cos(a) - t * Math.sin(a),
      Math.sin(a) + t * Math.cos(a)
    );
    const [c2x, c2y] = map(
      Math.cos(b) + t * Math.sin(b),
      Math.sin(b) - t * Math.cos(b)
    );
    const [ex, ey] = i === count - 1 ? [x2, y2] : map(Math.cos(b), Math.sin(b));
    segments.push({
      op: "C",
      x1: c1x,
      y1: c1y,
      x2: c2x,
      y2: c2y,
      x: ex,
      y: ey,
    });
  }
  return segments;
}

/**
 * Parses SVG path data into absolute M/L/C/Z segments (H/V/S/Q/T/A are
 * converted). Stops at the first malformed command, like browsers do.
 */
export function parsePathData(d: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = "";
  // Last control point, for S/T reflection
  let lastCubic: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;

  const skip = () => {
    while (index < d.length && /[\s,]/.test(d[index] as string)) {
      index++;
    }
  };
  const readNumber = (): number | null => {
    skip();
    NUMBER_RE.lastIndex = index;
    const match = NUMBER_RE.exec(d);
    if (!match) {
      return null;
    }
    index = NUMBER_RE.lastIndex;
    return Number(match[0]);
  };
  const readFlag = (): boolean | null => {
    skip();
    const char = d[index];
    if (char === "0" || char === "1") {
      index++;
      return char === "1";
    }
    return null;
  };
  const read = (count: number): number[] | null => {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      const value = readNumber();
      if (value === null) {
        return null;
      }
      values.push(value);
    }
    return values;
  };

  while (true) {
    skip();
    if (index >= d.length) {
      break;
    }
    const char = d[index] as string;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(char)) {
      command = char;
      index++;
    } else if (!command || command === "Z" || command === "z") {
      break;
    }

    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    const upper = command.toUpperCase();

    if (upper === "Z") {
      segments.push({ op: "Z" });
      x = startX;
      y = startY;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    if (upper === "A") {
      const radii = read(3);
      const large = readFlag();
      const sweepFlag = readFlag();
      const end = read(2);
      if (!(radii && end) || large === null || sweepFlag === null) {
        break;
      }
      const [rx, ry, rotation] = radii as [number, number, number];
      const ex = (end[0] as number) + ox;
      const ey = (end[1] as number) + oy;
      segments.push(
        ...arcToCubics(x, y, rx, ry, rotation, large, sweepFlag, ex, ey)
      );
      x = ex;
      y = ey;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    const arity =
      { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 }[upper] ?? 0;
    const values = read(arity);
    if (!values) {
      break;
    }
    const v = values as number[];

    switch (upper) {
      case "M":
        x = (v[0] as number) + ox;
        y = (v[1] as number) + oy;
        startX = x;
        startY = y;
        segments.push({ op: "M", x, y });
        // Extra coordinate pairs after a move are implicit line-tos.
        command = relative ? "l" : "L";
        lastCubic = null;
        lastQuad = null;
        break;
      case "L":
      case "H":
      case "V":
        if (upper !== "V") {
          x = (v[0] as number) + ox;
        }
        if (upper === "V") {
          y = (v[0] as number) + oy;
        } else if (upper === "L") {
          y = (v[1] as number) + oy;
        }
        segments.push({ op: "L", x, y });
        lastCubic = null;
        lastQuad = null;
        break;
      case "C":
      case "S": {
        let c1: [number, number];
        let rest: number[];
        if (upper === "C") {
          c1 = [(v[0] as number) + ox, (v[1] as number) + oy];
          rest = v.slice(2);
        } else {
          c1 = lastCubic
            ? [2 * x - lastCubic[0], 2 * y - lastCubic[1]]
            : [x, y];
          rest = v;
        }
        const c2: [number, number] = [
          (rest[0] as number) + ox,
          (rest[1] as number) + oy,
        ];
        const end: [number, number] = [
          (rest[2] as number) + ox,
          (rest[3] as number) + oy,
        ];
        segments.push({
          op: "C",
          x1: c1[0],
          y1: c1[1],
          x2: c2[0],
          y2: c2[1],
          x: end[0],
          y: end[1],
        });
        [x, y] = end;
        lastCubic = c2;
        lastQuad = null;
        break;
      }
      case "Q":
      case "T": {
        let q: [number, number];
        let end: [number, number];
        if (upper === "Q") {
          q = [(v[0] as number) + ox, (v[1] as number) + oy];
          end = [(v[2] as number) + ox, (v[3] as number) + oy];
        } else {
          q = lastQuad ? [2 * x - lastQuad[0], 2 * y - lastQuad[1]] : [x, y];
          end = [(v[0] as number) + ox, (v[1] as number) + oy];
        }
        segments.push({
          op: "C",
          x1: x + (2 / 3) * (q[0] - x),
          y1: y + (2 / 3) * (q[1] - y),
          x2: end[0] + (2 / 3) * (q[0] - end[0]),
          y2: end[1] + (2 / 3) * (q[1] - end[1]),
          x: end[0],
          y: end[1],
        });
        [x, y] = end;
        lastQuad = q;
        lastCubic = null;
        break;
      }
      default:
        break;
    }
  }

  return segments;
}

const KAPPA = 0.552_284_749_8;

/** Ellipse as four cubic segments. */
export function ellipseSegments(
  cx: number,
  cy: number,
  rx: number,
  ry: number
): Segment[] {
  if (rx <= 0 || ry <= 0) {
    return [];
  }
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { op: "M", x: cx + rx, y: cy },
    {
      op: "C",
      x1: cx + rx,
      y1: cy + ky,
      x2: cx + kx,
      y2: cy + ry,
      x: cx,
      y: cy + ry,
    },
    {
      op: "C",
      x1: cx - kx,
      y1: cy + ry,
      x2: cx - rx,
      y2: cy + ky,
      x: cx - rx,
      y: cy,
    },
    {
      op: "C",
      x1: cx - rx,
      y1: cy - ky,
      x2: cx - kx,
      y2: cy - ry,
      x: cx,
      y: cy - ry,
    },
    {
      op: "C",
      x1: cx + kx,
      y1: cy - ry,
      x2: cx + rx,
      y2: cy - ky,
      x: cx + rx,
      y: cy,
    },
    { op: "Z" },
  ];
}

/** Rectangle (optionally rounded) as segments. */
export function rectSegments(
  x: number,
  y: number,
  width: number,
  height: number,
  rxIn = 0,
  ryIn = 0
): Segment[] {
  if (width <= 0 || height <= 0) {
    return [];
  }
  const rx = Math.min(Math.max(rxIn, 0), width / 2);
  const ry = Math.min(Math.max(ryIn, 0), height / 2);
  if (rx === 0 || ry === 0) {
    return [
      { op: "M", x, y },
      { op: "L", x: x + width, y },
      { op: "L", x: x + width, y: y + height },
      { op: "L", x, y: y + height },
      { op: "Z" },
    ];
  }
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const right = x + width;
  const bottom = y + height;
  return [
    { op: "M", x: x + rx, y },
    { op: "L", x: right - rx, y },
    {
      op: "C",
      x1: right - rx + kx,
      y1: y,
      x2: right,
      y2: y + ry - ky,
      x: right,
      y: y + ry,
    },
    { op: "L", x: right, y: bottom - ry },
    {
      op: "C",
      x1: right,
      y1: bottom - ry + ky,
      x2: right - rx + kx,
      y2: bottom,
      x: right - rx,
      y: bottom,
    },
    { op: "L", x: x + rx, y: bottom },
    {
      op: "C",
      x1: x + rx - kx,
      y1: bottom,
      x2: x,
      y2: bottom - ry + ky,
      x,
      y: bottom - ry,
    },
    { op: "L", x, y: y + ry },
    { op: "C", x1: x, y1: y + ry - ky, x2: x + rx - kx, y2: y, x: x + rx, y },
    { op: "Z" },
  ];
}
