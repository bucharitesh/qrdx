/** biome-ignore-all lint/style/noMagicNumbers: path grammar */
// Strict reader for the path data a frame spec may hold. Unlike
// `parsePathData` (which reads markup this library wrote and stops quietly at
// the first malformed command), this rejects anything outside the grammar:
// only the SVG path commands, plain decimal numbers (no exponents), spaces
// and commas. Output is always re-serialized from the numbers it read, so no
// character of the input reaches an SVG, canvas, PDF or EPS file.

import { fmt } from "./fmt";

/** One path command with its own arguments (implicit repeats are split). */
export interface PathCommand {
  /** Command letter as written: upper case is absolute, lower case relative */
  command: string;
  values: number[];
}

const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

/** Characters path data in a frame spec may contain. */
export const PATH_DATA_CHARSET = /^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-\s]*$/;

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)/y;

/**
 * Reads path data into commands, or returns null when it breaks the grammar
 * (unknown characters, a missing argument, an exponent, more than
 * `maxDecimals` decimals, or not starting with a move).
 */
export function tokenizePathData(
  d: string,
  maxDecimals = Number.POSITIVE_INFINITY
): PathCommand[] | null {
  if (!PATH_DATA_CHARSET.test(d)) {
    return null;
  }
  const commands: PathCommand[] = [];
  let index = 0;
  const skip = () => {
    while (index < d.length && /[\s,]/.test(d[index] as string)) {
      index++;
    }
  };
  const readNumber = (): number | null => {
    skip();
    NUMBER.lastIndex = index;
    const match = NUMBER.exec(d);
    if (!match) {
      return null;
    }
    const text = match[0];
    const dot = text.indexOf(".");
    if (dot >= 0 && text.length - dot - 1 > maxDecimals) {
      return null;
    }
    index = NUMBER.lastIndex;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  };
  const readFlag = (): number | null => {
    skip();
    const char = d[index];
    if (char === "0" || char === "1") {
      index++;
      return char === "1" ? 1 : 0;
    }
    return null;
  };
  const startsNumber = () => {
    skip();
    return index < d.length && /[0-9.+-]/.test(d[index] as string);
  };

  skip();
  while (index < d.length) {
    const letter = d[index] as string;
    const upper = letter.toUpperCase();
    const arity = ARITY[upper];
    if (arity === undefined) {
      return null;
    }
    if (commands.length === 0 && upper !== "M") {
      return null;
    }
    index++;
    if (arity === 0) {
      commands.push({ command: letter, values: [] });
      skip();
      continue;
    }
    let command = letter;
    let first = true;
    while (first || startsNumber()) {
      const values: number[] = [];
      for (let i = 0; i < arity; i++) {
        const value =
          upper === "A" && (i === 3 || i === 4) ? readFlag() : readNumber();
        if (value === null) {
          return null;
        }
        values.push(value);
      }
      commands.push({ command, values });
      // Extra pairs after a move are line-tos
      if (upper === "M") {
        command = letter === "M" ? "L" : "l";
      }
      first = false;
    }
    skip();
  }
  return commands;
}

/** Segments a command adds once drawn (an arc becomes up to four curves). */
export function countPathSegments(commands: PathCommand[]): number {
  let count = 0;
  for (const { command } of commands) {
    count += command.toUpperCase() === "A" ? 4 : 1;
  }
  return count;
}

/**
 * Writes commands back as path data, scaled by `scale` and moved by
 * (dx, dy). Relative commands are only scaled; arc radii scale and arc
 * angles and flags are kept, so the shape is exact under the uniform scale.
 */
export function writePathData(
  commands: PathCommand[],
  scale = 1,
  dx = 0,
  dy = 0
): string {
  let out = "";
  for (const { command, values } of commands) {
    const upper = command.toUpperCase();
    const absolute = command === upper;
    const ox = absolute ? dx : 0;
    const oy = absolute ? dy : 0;
    let args: string[];
    switch (upper) {
      case "Z":
        args = [];
        break;
      case "H":
        args = [fmt((values[0] as number) * scale + ox)];
        break;
      case "V":
        args = [fmt((values[0] as number) * scale + oy)];
        break;
      case "A":
        args = [
          fmt(Math.abs(values[0] as number) * scale),
          fmt(Math.abs(values[1] as number) * scale),
          fmt(values[2] as number),
          String(values[3]),
          String(values[4]),
          fmt((values[5] as number) * scale + ox),
          fmt((values[6] as number) * scale + oy),
        ];
        break;
      default:
        args = values.map((value, i) =>
          fmt(value * scale + (i % 2 === 0 ? ox : oy))
        );
    }
    out += command + args.join(" ");
  }
  return out;
}
