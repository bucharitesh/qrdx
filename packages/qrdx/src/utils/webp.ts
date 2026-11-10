/** biome-ignore-all lint/style/noMagicNumbers: WebP (VP8L) format constants */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: bit packing */
// A small lossless WebP (VP8L) encoder and a RIFF reader, in plain
// TypeScript with no DOM. Browsers that can't encode WebP from a canvas
// (Safari hands back a PNG for toBlob("image/webp")) use it instead.
//
// It keeps every pixel exact, alpha included, and is built for what QR codes
// look like: flat colors in long runs and rows that repeat the row above. It
// applies the subtract-green transform, codes runs and row copies as
// backward references, and writes canonical prefix (Huffman) codes. The
// format is RFC 9649 ("WebP Image Format"), section 3.

/** Largest width or height VP8L can store. */
export const WEBP_MAX_DIMENSION = 16_384;

const NUM_LITERALS = 256;
const NUM_LENGTH_CODES = 24;
const NUM_DISTANCE_CODES = 40;
const MAX_COPY_LENGTH = 4096;
/** Shorter repeats are cheaper as literals. */
const MIN_COPY_LENGTH = 3;
const MAX_CODE_LENGTH = 15;
const MAX_CODE_LENGTH_CODE_LENGTH = 7;
/** Plane code of the pixel above (dx 0, dy 1) and the one before (dx 1, dy 0). */
const PLANE_CODE_ABOVE = 1;
const PLANE_CODE_LEFT = 2;
const CODE_LENGTH_ORDER = [
  17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
/** The code length the decoder repeats before any is read. */
const DEFAULT_CODE_LENGTH = 8;

/** Writes bits least significant first, as VP8L reads them. */
class BitWriter {
  private buffer: Uint8Array;
  private position = 0;
  private bits = 0;
  private used = 0;

  constructor(capacity: number) {
    this.buffer = new Uint8Array(Math.max(capacity, 64));
  }

  /** Writes the low `count` bits of `value` (count at most 24). */
  write(value: number, count: number) {
    if (count === 0) {
      return;
    }
    this.bits |= value << this.used;
    this.used += count;
    while (this.used >= 8) {
      if (this.position === this.buffer.length) {
        const grown = new Uint8Array(this.buffer.length * 2);
        grown.set(this.buffer);
        this.buffer = grown;
      }
      this.buffer[this.position++] = this.bits & 0xff;
      this.bits >>>= 8;
      this.used -= 8;
    }
  }

  /** The bytes written, the last one padded with zero bits. */
  finish(): Uint8Array {
    if (this.used > 0) {
      this.write(0, 8 - this.used);
    }
    return this.buffer.subarray(0, this.position);
  }
}

/** A prefix code: the bit count and (bit-reversed) bits of each symbol. */
interface PrefixCode {
  lengths: Uint8Array;
  codes: Uint16Array;
  /** Bits actually written per symbol: none when the code has one symbol. */
  emitted: Uint8Array;
}

/**
 * Huffman code lengths for these symbol counts, none longer than `limit`.
 * When the tree comes out too deep, small counts are raised and it is built
 * again, which flattens it. Exactly one used symbol gets length 1.
 */
export function huffmanLengths(
  counts: ArrayLike<number>,
  limit: number
): Uint8Array {
  const lengths = new Uint8Array(counts.length);
  const symbols: number[] = [];
  for (let symbol = 0; symbol < counts.length; symbol++) {
    if ((counts[symbol] ?? 0) > 0) {
      symbols.push(symbol);
    }
  }
  if (symbols.length === 0) {
    return lengths;
  }
  if (symbols.length === 1) {
    lengths[symbols[0] as number] = 1;
    return lengths;
  }

  const leaves = symbols.length;
  const nodes = 2 * leaves - 1;
  const weight = new Float64Array(nodes);
  const parent = new Int32Array(nodes);
  const depth = new Uint8Array(nodes);
  for (let floor = 1; ; floor *= 2) {
    for (let leaf = 0; leaf < leaves; leaf++) {
      weight[leaf] = Math.max(counts[symbols[leaf] as number] ?? 0, floor);
    }
    const order = Array.from({ length: leaves }, (_, leaf) => leaf).sort(
      (a, b) => (weight[a] as number) - (weight[b] as number) || a - b
    );
    // Two queues: the sorted leaves, then the merged nodes in the order they
    // were made (their weights only grow).
    let nextLeaf = 0;
    let nextMerged = leaves;
    const take = (made: number): number => {
      if (
        nextLeaf < leaves &&
        (nextMerged >= made ||
          (weight[order[nextLeaf] as number] as number) <=
            (weight[nextMerged] as number))
      ) {
        return order[nextLeaf++] as number;
      }
      return nextMerged++;
    };
    for (let made = leaves; made < nodes; made++) {
      const a = take(made);
      const b = take(made);
      weight[made] = (weight[a] as number) + (weight[b] as number);
      parent[a] = made;
      parent[b] = made;
    }
    // Every node's parent was made after it, so walk down from the root.
    depth[nodes - 1] = 0;
    let deepest = 0;
    for (let node = nodes - 2; node >= 0; node--) {
      const nodeDepth = (depth[parent[node] as number] as number) + 1;
      depth[node] = nodeDepth;
      if (node < leaves && nodeDepth > deepest) {
        deepest = nodeDepth;
      }
    }
    if (deepest <= limit) {
      for (let leaf = 0; leaf < leaves; leaf++) {
        lengths[symbols[leaf] as number] = depth[leaf] as number;
      }
      return lengths;
    }
  }
}

function reverseBits(value: number, count: number): number {
  let reversed = 0;
  for (let bit = 0; bit < count; bit++) {
    reversed = (reversed << 1) | ((value >> bit) & 1);
  }
  return reversed;
}

/** Canonical codes for these lengths, as VP8L (and DEFLATE) assign them. */
function prefixCode(lengths: Uint8Array): PrefixCode {
  const perLength = new Uint16Array(MAX_CODE_LENGTH + 1);
  let used = 0;
  for (const length of lengths) {
    if (length > 0) {
      perLength[length] = (perLength[length] as number) + 1;
      used++;
    }
  }
  const next = new Uint16Array(MAX_CODE_LENGTH + 1);
  let code = 0;
  for (let length = 1; length <= MAX_CODE_LENGTH; length++) {
    code = (code + (perLength[length - 1] as number)) << 1;
    next[length] = code;
  }
  const codes = new Uint16Array(lengths.length);
  const emitted = new Uint8Array(lengths.length);
  lengths.forEach((length, symbol) => {
    if (length === 0) {
      return;
    }
    const value = next[length] as number;
    next[length] = value + 1;
    codes[symbol] = reverseBits(value, length);
    // A decoder reads a one-symbol code as zero bits.
    emitted[symbol] = used === 1 ? 0 : length;
  });
  return { lengths, codes, emitted };
}

function writeSymbol(writer: BitWriter, code: PrefixCode, symbol: number) {
  writer.write(code.codes[symbol] as number, code.emitted[symbol] as number);
}

interface LengthToken {
  code: number;
  extra: number;
  extraBits: number;
}

/** Code lengths as code-length symbols, with 16, 17 and 18 for repeats. */
function tokenizeLengths(lengths: Uint8Array): LengthToken[] {
  const tokens: LengthToken[] = [];
  const literal = (code: number) =>
    tokens.push({ code, extra: 0, extraBits: 0 });
  let previous = DEFAULT_CODE_LENGTH;
  let index = 0;
  while (index < lengths.length) {
    const value = lengths[index] as number;
    let run = 1;
    while (index + run < lengths.length && lengths[index + run] === value) {
      run++;
    }
    index += run;
    let left = run;
    if (value === 0) {
      while (left > 0) {
        if (left < 3) {
          for (; left > 0; left--) {
            literal(0);
          }
        } else if (left <= 10) {
          tokens.push({ code: 17, extra: left - 3, extraBits: 3 });
          left = 0;
        } else {
          const repeat = Math.min(left, 138);
          tokens.push({ code: 18, extra: repeat - 11, extraBits: 7 });
          left -= repeat;
        }
      }
      continue;
    }
    if (value !== previous) {
      literal(value);
      previous = value;
      left--;
    }
    while (left > 0) {
      if (left < 3) {
        for (; left > 0; left--) {
          literal(value);
        }
      } else {
        const repeat = Math.min(left, 6);
        tokens.push({ code: 16, extra: repeat - 3, extraBits: 2 });
        left -= repeat;
      }
    }
  }
  return tokens;
}

/** Writes a prefix code's lengths so a decoder can rebuild it. */
function writePrefixCode(writer: BitWriter, lengths: Uint8Array) {
  const used: number[] = [];
  lengths.forEach((length, symbol) => {
    if (length > 0) {
      used.push(symbol);
    }
  });
  // Simple code: one or two symbols below 256 (none: one unused symbol 0).
  if (used.length <= 2 && used.every((symbol) => symbol < NUM_LITERALS)) {
    const [first = 0, second] = used;
    writer.write(1, 1);
    writer.write(used.length === 2 ? 1 : 0, 1);
    if (first < 2) {
      writer.write(0, 1);
      writer.write(first, 1);
    } else {
      writer.write(1, 1);
      writer.write(first, 8);
    }
    if (second !== undefined) {
      writer.write(second, 8);
    }
    return;
  }

  // Normal code: the lengths, run-length coded with a code of their own.
  const tokens = tokenizeLengths(lengths);
  const counts = new Uint32Array(19);
  for (const token of tokens) {
    counts[token.code] = (counts[token.code] as number) + 1;
  }
  const lengthCode = prefixCode(
    huffmanLengths(counts, MAX_CODE_LENGTH_CODE_LENGTH)
  );
  let stored = CODE_LENGTH_ORDER.length;
  while (
    stored > 4 &&
    lengthCode.lengths[CODE_LENGTH_ORDER[stored - 1] as number] === 0
  ) {
    stored--;
  }
  writer.write(0, 1);
  writer.write(stored - 4, 4);
  for (let index = 0; index < stored; index++) {
    writer.write(
      lengthCode.lengths[CODE_LENGTH_ORDER[index] as number] as number,
      3
    );
  }
  // No max_symbol: the tokens cover the whole alphabet.
  writer.write(0, 1);
  for (const token of tokens) {
    writeSymbol(writer, lengthCode, token.code);
    writer.write(token.extra, token.extraBits);
  }
}

/** A length or distance (from 1) as a prefix symbol plus extra bits. */
function prefixEncode(value: number): {
  symbol: number;
  extra: number;
  extraBits: number;
} {
  const offset = value - 1;
  if (offset < 4) {
    return { symbol: offset, extra: 0, extraBits: 0 };
  }
  const highest = 31 - Math.clz32(offset);
  const second = (offset >> (highest - 1)) & 1;
  const extraBits = highest - 1;
  return {
    symbol: 2 * highest + second,
    extra: offset & ((1 << extraBits) - 1),
    extraBits,
  };
}

interface Visitor {
  literal: (pixel: number) => void;
  copy: (length: number, planeCode: number) => void;
}

/** Repeats of this many pixels starting at `from`, of the ones `back` earlier. */
function matchLength(
  argb: Uint32Array,
  from: number,
  back: number,
  max: number
): number {
  let length = 0;
  while (length < max && argb[from + length] === argb[from + length - back]) {
    length++;
  }
  return length;
}

/**
 * Splits the pixels into literals and backward references: a run of the
 * previous pixel, or a copy of the row above, whichever is longer. The same
 * pixels always split the same way, so it runs once to count and once to write.
 */
function parse(argb: Uint32Array, width: number, visit: Visitor) {
  const total = argb.length;
  let index = 0;
  while (index < total) {
    const max = Math.min(MAX_COPY_LENGTH, total - index);
    const run = index >= 1 ? matchLength(argb, index, 1, max) : 0;
    const above = index >= width ? matchLength(argb, index, width, max) : 0;
    if (Math.max(run, above) >= MIN_COPY_LENGTH) {
      if (above >= run) {
        visit.copy(above, width === 1 ? PLANE_CODE_LEFT : PLANE_CODE_ABOVE);
        index += above;
      } else {
        visit.copy(run, PLANE_CODE_LEFT);
        index += run;
      }
      continue;
    }
    visit.literal(argb[index] as number);
    index++;
  }
}

const RIFF_HEADER_SIZE = 20;

function writeAscii(target: Uint8Array, offset: number, text: string) {
  for (let index = 0; index < text.length; index++) {
    target[offset + index] = text.charCodeAt(index);
  }
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Encodes RGBA pixels (4 bytes each, row by row, not premultiplied, as
 * `getImageData` returns them) as a lossless WebP file. Every pixel decodes
 * back exactly, transparent ones included.
 */
export function encodeWebPLossless(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): Uint8Array {
  if (
    !(Number.isInteger(width) && Number.isInteger(height)) ||
    width < 1 ||
    height < 1 ||
    width > WEBP_MAX_DIMENSION ||
    height > WEBP_MAX_DIMENSION
  ) {
    throw new RangeError(
      `WebP images are 1 to ${WEBP_MAX_DIMENSION} pixels wide and high (got ${width} × ${height})`
    );
  }
  const total = width * height;
  if (rgba.length < total * 4) {
    throw new RangeError(
      `Expected ${total * 4} bytes of RGBA for ${width} × ${height}, got ${rgba.length}`
    );
  }

  // Subtract green: gray and two-tone codes then need no red or blue bits.
  const argb = new Uint32Array(total);
  let hasAlpha = false;
  for (let pixel = 0; pixel < total; pixel++) {
    const offset = pixel * 4;
    const red = rgba[offset] as number;
    const green = rgba[offset + 1] as number;
    const blue = rgba[offset + 2] as number;
    const alpha = rgba[offset + 3] as number;
    if (alpha !== 255) {
      hasAlpha = true;
    }
    argb[pixel] =
      ((alpha << 24) |
        (((red - green) & 0xff) << 16) |
        (green << 8) |
        ((blue - green) & 0xff)) >>>
      0;
  }

  // Count the symbols, then build one prefix code per channel.
  const green = new Uint32Array(NUM_LITERALS + NUM_LENGTH_CODES);
  const red = new Uint32Array(NUM_LITERALS);
  const blue = new Uint32Array(NUM_LITERALS);
  const alpha = new Uint32Array(NUM_LITERALS);
  const distance = new Uint32Array(NUM_DISTANCE_CODES);
  parse(argb, width, {
    literal(pixel) {
      green[(pixel >>> 8) & 0xff]++;
      red[(pixel >>> 16) & 0xff]++;
      blue[pixel & 0xff]++;
      alpha[pixel >>> 24]++;
    },
    copy(length, planeCode) {
      green[NUM_LITERALS + prefixEncode(length).symbol]++;
      distance[prefixEncode(planeCode).symbol]++;
    },
  });
  const lengths = [green, red, blue, alpha, distance].map((counts) =>
    huffmanLengths(counts, MAX_CODE_LENGTH)
  );
  const [greenCode, redCode, blueCode, alphaCode, distanceCode] = lengths.map(
    prefixCode
  ) as [PrefixCode, PrefixCode, PrefixCode, PrefixCode, PrefixCode];

  const writer = new BitWriter(Math.ceil(total / 4) + 1024);
  writer.write(0x2f, 8);
  writer.write(width - 1, 14);
  writer.write(height - 1, 14);
  writer.write(hasAlpha ? 1 : 0, 1);
  writer.write(0, 3);
  // One transform, subtract green (type 2), then no more.
  writer.write(1, 1);
  writer.write(2, 2);
  writer.write(0, 1);
  // No color cache, no meta prefix codes.
  writer.write(0, 1);
  writer.write(0, 1);
  for (const codeLengths of lengths) {
    writePrefixCode(writer, codeLengths);
  }
  parse(argb, width, {
    literal(pixel) {
      writeSymbol(writer, greenCode, (pixel >>> 8) & 0xff);
      writeSymbol(writer, redCode, (pixel >>> 16) & 0xff);
      writeSymbol(writer, blueCode, pixel & 0xff);
      writeSymbol(writer, alphaCode, pixel >>> 24);
    },
    copy(length, planeCode) {
      const lengthPrefix = prefixEncode(length);
      writeSymbol(writer, greenCode, NUM_LITERALS + lengthPrefix.symbol);
      writer.write(lengthPrefix.extra, lengthPrefix.extraBits);
      const distancePrefix = prefixEncode(planeCode);
      writeSymbol(writer, distanceCode, distancePrefix.symbol);
      writer.write(distancePrefix.extra, distancePrefix.extraBits);
    },
  });
  const bitstream = writer.finish();

  const padded = bitstream.length + (bitstream.length & 1);
  const file = new Uint8Array(RIFF_HEADER_SIZE + padded);
  writeAscii(file, 0, "RIFF");
  writeUint32(file, 4, file.length - 8);
  writeAscii(file, 8, "WEBPVP8L");
  writeUint32(file, 16, bitstream.length);
  file.set(bitstream, RIFF_HEADER_SIZE);
  return file;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/** True when the bytes start like a WebP file (`RIFF····WEBP`). */
export function isWebPFile(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  );
}

/**
 * How a WebP file's image is compressed: "lossless" (VP8L) or "lossy" (VP8,
 * with or without an alpha chunk), or null when it isn't WebP or has no image
 * chunk in the bytes given.
 */
export function getWebPCompression(
  bytes: Uint8Array
): "lossless" | "lossy" | null {
  if (!isWebPFile(bytes)) {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCC = ascii(bytes, offset, 4);
    if (fourCC === "VP8L") {
      return "lossless";
    }
    if (fourCC === "VP8 ") {
      return "lossy";
    }
    const size =
      ((bytes[offset + 4] as number) |
        ((bytes[offset + 5] as number) << 8) |
        ((bytes[offset + 6] as number) << 16) |
        ((bytes[offset + 7] as number) << 24)) >>>
      0;
    offset += 8 + size + (size & 1);
  }
  return null;
}
