import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

// A ZIP written file by file in the browser (the bulk tool, the CSV import's
// images, a selection of codes): each file goes into the archive as soon as
// it's made, and the archive's bytes move out of JavaScript memory into Blob
// parts every FLUSH_BYTES, which the browser may keep on disk. So memory
// stays flat however many files there are; only the finished Blob is big.

/** Archive bytes held in JavaScript before they become a Blob part. */
export const FLUSH_BYTES = 8 * 1024 * 1024;

/**
 * Files one archive can hold: the ZIP format without its 64-bit extension,
 * which fflate doesn't write, stops at 65,535 entries and 4 GB.
 */
export const MAX_ZIP_FILES = 65_535;

export interface ZipStream {
  /** Adds a file; `compress` for text (SVG, CSV), not for PNG. */
  add(name: string, bytes: Uint8Array, compress?: boolean): void;
  /** Ends the archive. */
  finish(): Promise<Blob>;
  /** Drops the archive (a cancelled run). */
  abort(): void;
  /** Files added so far. */
  readonly files: number;
  /** Archive bytes written so far. */
  readonly bytes: number;
}

export function createZipStream(): ZipStream {
  const parts: Blob[] = [];
  let pending: Uint8Array<ArrayBuffer>[] = [];
  let pendingBytes = 0;
  let files = 0;
  let bytes = 0;
  let settle: { resolve: (blob: Blob) => void; reject: (e: Error) => void };
  const done = new Promise<Blob>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // Unhandled if the archive is aborted before anyone awaits it.
  done.catch(() => {});

  const flush = () => {
    if (pending.length === 0) return;
    parts.push(new Blob(pending));
    pending = [];
    pendingBytes = 0;
  };

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      settle.reject(error);
      return;
    }
    // fflate types chunks as ArrayBufferLike-backed; they are plain ArrayBuffers.
    pending.push(chunk as Uint8Array<ArrayBuffer>);
    pendingBytes += chunk.length;
    bytes += chunk.length;
    if (pendingBytes >= FLUSH_BYTES) flush();
    if (final) {
      flush();
      settle.resolve(new Blob(parts, { type: "application/zip" }));
    }
  });

  return {
    add(name, data, compress = false) {
      const entry = compress
        ? new ZipDeflate(name, { level: 6 })
        : new ZipPassThrough(name);
      zip.add(entry);
      entry.push(data, true);
      files++;
    },
    finish() {
      zip.end();
      return done;
    },
    abort() {
      zip.terminate();
      parts.length = 0;
      pending = [];
    },
    get files() {
      return files;
    },
    get bytes() {
      return bytes;
    },
  };
}

/**
 * Archive size at which a batch starts a new ZIP. Measured: 25,000 PNGs at
 * 512 px come to about 2.1 GB and 10,000 at 1024 px to 2.3 GB, more than one
 * archive (4 GB without ZIP64) or the browser's memory should hold; each
 * part is handed to the download and released before the next one fills.
 */
export const ZIP_PART_BYTES = 512 * 1024 * 1024;

export interface ZipParts {
  add(name: string, bytes: Uint8Array, compress?: boolean): Promise<void>;
  /** Ends the last part: for the caller to save, with how many parts there are. */
  finish(): Promise<{ blob: Blob; filename: string; parts: number }>;
  abort(): void;
  readonly files: number;
}

/**
 * A batch saved as one ZIP, or as several when it outgrows ZIP_PART_BYTES:
 * each full part is saved (downloaded) right away and dropped from memory,
 * as `<base>-1.zip`, `<base>-2.zip`, …; a batch that fits stays `<base>.zip`.
 * The last part is returned by finish() for the caller to save.
 */
export function createZipParts(
  base: string,
  { maxBytes = ZIP_PART_BYTES, maxFiles = MAX_ZIP_FILES - 1 } = {},
): ZipParts {
  let current = createZipStream();
  let part = 1;
  let files = 0;
  return {
    async add(name, data, compress) {
      if (
        current.files > 0 &&
        (current.bytes + data.length > maxBytes || current.files >= maxFiles)
      ) {
        saveBlob(await current.finish(), `${base}-${part}.zip`);
        part++;
        current = createZipStream();
      }
      current.add(name, data, compress);
      files++;
    },
    async finish() {
      return {
        blob: await current.finish(),
        filename: part === 1 ? `${base}.zip` : `${base}-${part}.zip`,
        parts: part,
      };
    },
    abort() {
      current.abort();
    },
    get files() {
      return files;
    },
  };
}

/** Saves a Blob as a download (the object URL is released after a while). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The download holds its own reference once it has started.
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}
