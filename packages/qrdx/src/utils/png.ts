/** biome-ignore-all lint/style/noMagicNumbers: PNG format constants */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: PNG filters */
// Minimal PNG reader (8-bit, non-interlaced) and zlib helpers built on the
// Compression Streams API, which browsers and Node 18+ both provide.

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA bytes, row by row */
  data: Uint8Array;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function transform(
  bytes: Uint8Array,
  stream: GenericTransformStream
): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** zlib-wrapped deflate, or null when Compression Streams are unavailable. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") {
    return null;
  }
  return await transform(bytes, new CompressionStream("deflate"));
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") {
    return null;
  }
  try {
    return await transform(bytes, new DecompressionStream("deflate"));
  } catch {
    return null;
  }
}

const readUint32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] as number) * 2 ** 24 +
    ((bytes[offset + 1] as number) << 16) +
    ((bytes[offset + 2] as number) << 8) +
    (bytes[offset + 3] as number)) >>>
  0;

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

/**
 * Decodes 8-bit, non-interlaced PNGs (gray, gray+alpha, RGB, RGBA, palette).
 * Returns null for anything else.
 */
export async function decodePng(
  bytes: Uint8Array
): Promise<DecodedImage | null> {
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return null;
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const chunks: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const chunkLength = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    offset += 12 + chunkLength;
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      const bitDepth = data[8];
      colorType = data[9] as number;
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || !(colorType in CHANNELS)) {
        return null;
      }
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!(width && height) || width * height > 4096 * 4096) {
    return null;
  }

  const compressed = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  );
  let position = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, position);
    position += chunk.length;
  }
  const raw = await inflate(compressed);
  const channels = CHANNELS[colorType] as number;
  const stride = width * channels;
  if (!raw || raw.length < height * (stride + 1)) {
    return null;
  }

  // Undo the per-row filters in place.
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? (pixels[out + x - channels] as number) : 0;
      const up = y > 0 ? (pixels[out - stride + x] as number) : 0;
      const upLeft =
        y > 0 && x >= channels
          ? (pixels[out - stride + x - channels] as number)
          : 0;
      const value = row[x] as number;
      let predicted = 0;
      if (filter === 1) {
        predicted = left;
      } else if (filter === 2) {
        predicted = up;
      } else if (filter === 3) {
        predicted = (left + up) >> 1;
      } else if (filter === 4) {
        predicted = paeth(left, up, upLeft);
      }
      pixels[out + x] = (value + predicted) & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const p = i * channels;
    if (colorType === 3) {
      const index = pixels[p] as number;
      rgba[o] = palette?.[index * 3] ?? 0;
      rgba[o + 1] = palette?.[index * 3 + 1] ?? 0;
      rgba[o + 2] = palette?.[index * 3 + 2] ?? 0;
      rgba[o + 3] = transparency?.[index] ?? 255;
    } else if (colorType === 0 || colorType === 4) {
      const gray = pixels[p] as number;
      rgba[o] = gray;
      rgba[o + 1] = gray;
      rgba[o + 2] = gray;
      rgba[o + 3] = colorType === 4 ? (pixels[p + 1] as number) : 255;
    } else {
      rgba[o] = pixels[p] as number;
      rgba[o + 1] = pixels[p + 1] as number;
      rgba[o + 2] = pixels[p + 2] as number;
      rgba[o + 3] = colorType === 6 ? (pixels[p + 3] as number) : 255;
    }
  }
  return { width, height, data: rgba };
}
