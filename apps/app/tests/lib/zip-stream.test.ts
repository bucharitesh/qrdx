// lib/zip-stream.ts: files go into the archive as they're made, its bytes
// move into Blob parts as it grows, and a batch past the part size is saved
// as several ZIPs (each one a complete archive).
import { strToU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createZipParts,
  createZipStream,
  MAX_ZIP_FILES,
} from "@/lib/zip-stream";

const saved: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  saved.length = 0;
  const blobs = new Map<string, Blob>();
  let next = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:test/${next++}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  // saveBlob clicks a download link: record what it would save.
  vi.stubGlobal("document", {
    createElement: () => {
      const link = {
        href: "",
        download: "",
        click: () => {
          saved.push({
            name: link.download,
            blob: blobs.get(link.href) as Blob,
          });
        },
        remove: () => {},
      };
      return link;
    },
    body: { appendChild: () => {} },
  });
});

const files = async (blob: Blob) =>
  Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))).sort();

/** Bytes that don't compress, like a PNG. */
const noise = (size: number, seed: number) =>
  Uint8Array.from({ length: size }, (_, i) => (i * 7919 + seed * 104729) % 251);

describe("createZipStream", () => {
  it("writes every file as it's added, stored or deflated", async () => {
    const zip = createZipStream();
    zip.add("a.png", noise(1000, 1));
    zip.add("b.svg", strToU8("<svg>".repeat(200)), true);
    expect(zip.files).toBe(2);
    expect(zip.bytes).toBeGreaterThan(1000);
    const blob = await zip.finish();
    expect(blob.type).toBe("application/zip");
    expect(await files(blob)).toEqual(["a.png", "b.svg"]);
    const unpacked = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(unpacked["b.svg"]).toEqual(strToU8("<svg>".repeat(200)));
  });

  it("stays under the ZIP format's file count", () => {
    expect(MAX_ZIP_FILES).toBe(65_535);
  });
});

describe("createZipParts", () => {
  it("keeps a batch that fits in one ZIP, named after the batch", async () => {
    const zip = createZipParts("menu-codes", { maxBytes: 1_000_000 });
    for (let i = 0; i < 5; i++) await zip.add(`${i}.png`, noise(1000, i));
    const last = await zip.finish();
    expect(last.parts).toBe(1);
    expect(last.filename).toBe("menu-codes.zip");
    expect(saved).toHaveLength(0);
    expect(await files(last.blob)).toHaveLength(5);
  });

  it("saves full parts as it goes and leaves the last to the caller", async () => {
    const zip = createZipParts("big", { maxBytes: 3500 });
    for (let i = 0; i < 10; i++) await zip.add(`${i}.png`, noise(1000, i));
    await zip.add("errors.csv", strToU8("row,error\n"), true);
    const last = await zip.finish();
    expect(zip.files).toBe(11);
    expect(saved.map((part) => part.name)).toEqual([
      "big-1.zip",
      "big-2.zip",
      "big-3.zip",
    ]);
    expect(last.filename).toBe("big-4.zip");
    expect(last.parts).toBe(4);
    const names = [
      ...(await Promise.all(saved.map((part) => files(part.blob)))).flat(),
      ...(await files(last.blob)),
    ];
    // Every file once, each part a whole archive.
    expect(names.sort()).toEqual(
      [
        ...Array.from({ length: 10 }, (_, i) => `${i}.png`),
        "errors.csv",
      ].sort(),
    );
  });

  it("starts a new part at the file limit", async () => {
    const zip = createZipParts("many", { maxFiles: 3 });
    for (let i = 0; i < 7; i++) await zip.add(`${i}.txt`, strToU8("x"));
    const last = await zip.finish();
    expect(saved.map((part) => part.name)).toEqual([
      "many-1.zip",
      "many-2.zip",
    ]);
    expect(await files(last.blob)).toEqual(["6.txt"]);
  });
});
