// Linear barcodes for coupon blocks, drawn as SVG without dependencies:
// Code 128 (any printable ASCII) and EAN-13 (12 digits + check digit).

export type BarcodeFormat = "code128" | "ean13";

// Code 128 symbol widths (bar, space, bar, space, bar, space), values 0–105.
const CODE128 = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 " +
  "221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 " +
  "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 " +
  "112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 " +
  "214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232"
).split(" ");
const CODE128_STOP = "2331112";
const START_B = 104;
const START_C = 105;
const SWITCH_TO_B = 100;
const SWITCH_TO_C = 99;

/** Printable ASCII only: what Code 128 set B (plus set C for digits) covers. */
export const CODE128_PATTERN = /^[\x20-\x7e]{1,48}$/;

const isDigit = (char: string | undefined) =>
  char !== undefined && char >= "0" && char <= "9";

function digitRun(value: string, from: number): number {
  let end = from;
  while (isDigit(value[end])) end++;
  return end - from;
}

/** Code 128 symbol values (start … check digit, without stop). */
export function code128Values(value: string): number[] {
  if (!CODE128_PATTERN.test(value)) {
    throw new Error("Code 128 supports printable ASCII characters only");
  }
  const values: number[] = [];
  let set: "B" | "C";
  let i = 0;

  // Set C packs two digits per symbol; worth it from 4 digits at the edges, 6 inside.
  const preferSetC = (run: number, atEdge: boolean) => run >= (atEdge ? 4 : 6);
  const firstRun = digitRun(value, 0);
  if (
    preferSetC(firstRun, true) ||
    (firstRun === value.length && firstRun >= 2)
  ) {
    set = "C";
    values.push(START_C);
  } else {
    set = "B";
    values.push(START_B);
  }

  while (i < value.length) {
    const run = digitRun(value, i);
    if (set === "C") {
      if (run >= 2) {
        values.push(Number(value.slice(i, i + 2)));
        i += 2;
        continue;
      }
      set = "B";
      values.push(SWITCH_TO_B);
    }
    if (preferSetC(run, i + run === value.length)) {
      // Keep an odd leading digit in set B so set C gets an even run.
      if (run % 2 === 1) {
        values.push((value.charCodeAt(i) as number) - 32);
        i++;
      }
      set = "C";
      values.push(SWITCH_TO_C);
      continue;
    }
    values.push((value.charCodeAt(i) as number) - 32);
    i++;
  }

  const checksum =
    values.reduce(
      (sum, symbol, index) => sum + symbol * Math.max(1, index),
      0,
    ) % 103;
  values.push(checksum);
  return values;
}

function widthsToModules(widths: string, modules: boolean[]) {
  let bar = true;
  for (const width of widths) {
    for (let n = 0; n < Number(width); n++) modules.push(bar);
    bar = !bar;
  }
}

/** Code 128 as dark (true) / light (false) modules, without quiet zones. */
export function encodeCode128(value: string): boolean[] {
  const modules: boolean[] = [];
  for (const symbol of code128Values(value)) {
    widthsToModules(CODE128[symbol] as string, modules);
  }
  widthsToModules(CODE128_STOP, modules);
  return modules;
}

const EAN_L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const EAN_R = EAN_L.map((code) =>
  [...code].map((bit) => (bit === "0" ? "1" : "0")).join(""),
);
const EAN_G = EAN_R.map((code) => [...code].reverse().join(""));
const EAN_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * The full 13-digit EAN for 12 digits (check digit appended) or 13 digits
 * (check digit verified); null when the input can't be an EAN-13.
 */
export function normalizeEan13(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "");
  if (/^\d{12}$/.test(digits)) return digits + ean13CheckDigit(digits);
  if (/^\d{13}$/.test(digits)) {
    return ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12])
      ? digits
      : null;
  }
  return null;
}

/** EAN-13 as dark/light modules (95), without quiet zones. */
export function encodeEan13(value: string): boolean[] {
  const ean = normalizeEan13(value);
  if (!ean) throw new Error("EAN-13 needs 12 digits or 13 with a valid check");
  const parity = EAN_PARITY[Number(ean[0])] as string;
  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    const table = parity[i - 1] === "L" ? EAN_L : EAN_G;
    bits += table[Number(ean[i])];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(ean[i])];
  bits += "101";
  return [...bits].map((bit) => bit === "1");
}

/** Why `value` can't be drawn in `format`, or null when it can. */
export function barcodeError(
  format: BarcodeFormat,
  value: string,
): string | null {
  if (format === "ean13") {
    return normalizeEan13(value)
      ? null
      : "EAN-13 needs 12 digits (or 13 with a valid check digit)";
  }
  return CODE128_PATTERN.test(value)
    ? null
    : "Code 128 supports up to 48 letters, digits and symbols (no emoji or accents)";
}

/** Dark runs as [start, width] pairs, for compact SVG output. */
function darkRuns(modules: boolean[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  modules.forEach((dark, index) => {
    if (dark && start < 0) start = index;
    if (!dark && start >= 0) {
      runs.push([start, index - start]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, modules.length - start]);
  return runs;
}

/**
 * The barcode as an SVG (always black on white so scanners read it), with
 * quiet zones and the value printed underneath. Server-renderable.
 */
export function Barcode({
  format,
  value,
  className,
}: {
  format: BarcodeFormat;
  value: string;
  className?: string;
}) {
  if (barcodeError(format, value)) return null;
  const modules =
    format === "ean13" ? encodeEan13(value) : encodeCode128(value);
  const text = format === "ean13" ? (normalizeEan13(value) as string) : value;
  const quiet = format === "ean13" ? 11 : 10;
  const width = modules.length + quiet * 2;
  const barHeight = 50;
  const height = barHeight + 14;

  return (
    <svg
      aria-label={`Barcode ${text}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#ffffff" height={height} width={width} x={0} y={0} />
      <path
        d={darkRuns(modules)
          .map(([x, w]) => `M${x + quiet} 0h${w}v${barHeight}h${-w}z`)
          .join("")}
        fill="#000000"
      />
      <text
        fill="#000000"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize={10}
        textAnchor="middle"
        x={width / 2}
        y={height - 2}
      >
        {text}
      </text>
    </svg>
  );
}
