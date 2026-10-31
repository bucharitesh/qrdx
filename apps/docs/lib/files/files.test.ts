// Pure file rules: types, names, magic bytes, quotas, references, block sources.
// Run: cd apps/docs && npx tsx --test lib/files/files.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesDeclaredType, sniffFileType } from "./magic";
import { checkUpload, usagePercent } from "./quota";
import { fileIdsInContent, fileIdsInLink } from "./references";
import { fileSourceSchema, sourceName, sourceUrl } from "./source";
import {
  acceptAttribute,
  displayFilename,
  FILE_ID_PATTERN,
  filePath,
  formatBytes,
  normalizeMime,
  storageFilename,
} from "./types";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const pad = (data: Uint8Array, length = 64) => {
  const out = new Uint8Array(Math.max(length, data.length));
  out.set(data);
  return out;
};

const MB = 1024 * 1024;
const ID = "cmvwdh3f80000d2cfbvda2bl3";

describe("normalizeMime", () => {
  it("accepts allowed types and vendor aliases", () => {
    assert.equal(normalizeMime("application/pdf", "a.pdf"), "application/pdf");
    assert.equal(normalizeMime("image/JPG", "a.jpg"), "image/jpeg");
    assert.equal(normalizeMime("audio/x-m4a", "a.m4a"), "audio/mp4");
    assert.equal(normalizeMime("audio/mp3", "a.mp3"), "audio/mpeg");
    assert.equal(normalizeMime("audio/x-wav", "a.wav"), "audio/wav");
    assert.equal(normalizeMime("video/mp4; codecs=avc1", "a.mp4"), "video/mp4");
  });

  it("falls back to the extension only when the type is missing", () => {
    assert.equal(normalizeMime("", "Menu.PDF"), "application/pdf");
    assert.equal(
      normalizeMime("application/octet-stream", "clip.mov"),
      "video/quicktime",
    );
    assert.equal(normalizeMime(undefined, "song.mp3"), "audio/mpeg");
    assert.equal(normalizeMime("", "notes.txt"), null);
  });

  it("rejects types that could run script or aren't supported", () => {
    for (const type of [
      "image/svg+xml",
      "text/html",
      "application/zip",
      "image/heic",
      "video/x-matroska",
    ]) {
      assert.equal(normalizeMime(type, "file.pdf"), null, type);
    }
  });

  it("builds accept attributes per kind", () => {
    assert.equal(acceptAttribute(["pdf"]), "application/pdf,.pdf");
    assert.ok(acceptAttribute(["image"]).includes(".webp"));
    assert.ok(!acceptAttribute(["image"]).includes("pdf"));
  });
});

describe("file names", () => {
  it("makes key-safe storage names with a matching extension", () => {
    assert.equal(
      storageFilename("Menü Été 2026.pdf", "application/pdf"),
      "Menu-Ete-2026.pdf",
    );
    assert.equal(
      storageFilename("../../etc/passwd", "application/pdf"),
      "passwd.pdf",
    );
    assert.equal(
      storageFilename("C:\\Users\\me\\photo.JPEG", "image/jpeg"),
      "photo.jpeg",
    );
    assert.equal(storageFilename("photo.png", "image/jpeg"), "photo.jpg");
    assert.equal(storageFilename("...", "audio/mpeg"), "file.mp3");
    assert.equal(storageFilename("写真.webp", "image/webp"), "file.webp");
    assert.ok(
      storageFilename(`${"a".repeat(300)}.mp4`, "video/mp4").length <= 84,
    );
  });

  it("keeps readable display names without paths or control characters", () => {
    assert.equal(displayFilename("/tmp/My\u0000 Menu\n.pdf"), "My Menu.pdf");
    assert.equal(displayFilename("  Spring   menu.pdf "), "Spring menu.pdf");
    assert.equal(displayFilename("写真.webp"), "写真.webp");
    const long = displayFilename(`${"x".repeat(400)}.pdf`);
    assert.equal(long.length, 200);
    assert.ok(long.endsWith(".pdf"));
  });

  it("formats sizes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(10 * MB), "10 MB");
    assert.equal(formatBytes(250 * MB), "250 MB");
    assert.equal(formatBytes(50 * 1024 * MB), "50 GB");
    assert.equal(formatBytes(Number.POSITIVE_INFINITY), "Unlimited");
  });
});

describe("magic bytes", () => {
  const cases: [string, Uint8Array, string | null][] = [
    ["pdf", pad(bytes("%PDF-1.7\n")), "pdf"],
    ["pdf after junk", pad(bytes([0xef, 0xbb, 0xbf], "\n%PDF-1.4")), "pdf"],
    ["jpeg", pad(bytes([0xff, 0xd8, 0xff, 0xe0])), "jpeg"],
    [
      "png",
      pad(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      "png",
    ],
    ["gif", pad(bytes("GIF89a")), "gif"],
    ["webp", pad(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")), "webp"],
    ["wav", pad(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")), "wav"],
    ["avif", pad(bytes([0, 0, 0, 0x1c], "ftypavif")), "avif"],
    ["heic", pad(bytes([0, 0, 0, 0x18], "ftypheic")), "heif"],
    ["mp4", pad(bytes([0, 0, 0, 0x20], "ftypisom")), "isobmff"],
    ["m4a", pad(bytes([0, 0, 0, 0x20], "ftypM4A ")), "isobmff"],
    ["mov", pad(bytes([0, 0, 0, 0x14], "ftypqt  ")), "quicktime"],
    ["old mov", pad(bytes([0, 0, 0, 0x08], "wide")), "quicktime"],
    ["ogg", pad(bytes("OggS")), "ogg"],
    ["flac", pad(bytes("fLaC")), "flac"],
    [
      "webm",
      pad(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], "webm")),
      "webm",
    ],
    [
      "matroska",
      pad(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], "matroska")),
      null,
    ],
    ["mp3 tag", pad(bytes("ID3", [4, 0])), "id3"],
    ["mp3 frame", pad(bytes([0xff, 0xfb, 0x90, 0x44])), "mp3"],
    ["aac adts", pad(bytes([0xff, 0xf1, 0x50, 0x80])), "aac"],
    ["html", pad(bytes("<!doctype html><script>")), null],
    ["svg", pad(bytes('<svg xmlns="http://www.w3.org/2000/svg">')), null],
    ["zip", pad(bytes("PK", [3, 4])), null],
    ["too short", bytes("%P"), null],
  ];
  for (const [name, data, expected] of cases) {
    it(`sniffs ${name}`, () => assert.equal(sniffFileType(data), expected));
  }

  it("accepts content of the declared kind only", () => {
    const html = pad(bytes("<html><body>phish</body></html>"));
    const png = pad(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const mp4 = pad(bytes([0, 0, 0, 0x20], "ftypisom"));
    assert.equal(matchesDeclaredType("application/pdf", html), false);
    assert.equal(
      matchesDeclaredType("image/jpeg", png),
      true,
      "PNG named .jpg is still an image",
    );
    assert.equal(matchesDeclaredType("image/png", mp4), false);
    assert.equal(matchesDeclaredType("video/mp4", mp4), true);
    assert.equal(matchesDeclaredType("audio/mp4", mp4), true);
    assert.equal(
      matchesDeclaredType(
        "image/avif",
        pad(bytes([0, 0, 0, 0x18], "ftypheic")),
      ),
      false,
    );
  });
});

describe("checkUpload", () => {
  const free = { storageBytes: 50 * MB, maxFileBytes: 10 * MB };

  it("enforces the per-file maximum", () => {
    const result = checkUpload({
      limits: free,
      usedBytes: 0,
      size: 11 * MB,
      planName: "Free",
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.code, "FILE_TOO_LARGE");
  });

  it("enforces the workspace quota", () => {
    const result = checkUpload({
      limits: free,
      usedBytes: 45 * MB,
      size: 6 * MB,
      planName: "Free",
    });
    assert.equal(result.ok ? null : result.code, "QUOTA_EXCEEDED");
    assert.ok(
      checkUpload({
        limits: free,
        usedBytes: 45 * MB,
        size: 5 * MB,
        planName: "Free",
      }).ok,
    );
  });

  it("counts the replaced file as freed", () => {
    assert.ok(
      checkUpload({
        limits: free,
        usedBytes: 49 * MB,
        size: 9 * MB,
        replacingBytes: 8 * MB,
        planName: "Free",
      }).ok,
    );
  });

  it("allows anything up to the max file size when storage is unlimited", () => {
    const unlimited = {
      storageBytes: Number.POSITIVE_INFINITY,
      maxFileBytes: 250 * MB,
    };
    assert.ok(
      checkUpload({
        limits: unlimited,
        usedBytes: 1e15,
        size: 200 * MB,
        planName: "Business",
      }).ok,
    );
  });

  it("reports usage percent", () => {
    assert.equal(usagePercent(25 * MB, 50 * MB), 50);
    assert.equal(usagePercent(80 * MB, 50 * MB), 100);
    assert.equal(usagePercent(1, Number.POSITIVE_INFINITY), 0);
  });
});

describe("references and sources", () => {
  it("finds file ids in page content and links", () => {
    const content = {
      version: 1,
      blocks: [
        {
          id: "a",
          type: "pdf",
          props: { source: { type: "file", fileId: ID, name: "x.pdf" } },
        },
        {
          id: "b",
          type: "gallery",
          props: {
            images: [
              { id: "i", source: { type: "url", url: "https://x.test/a.jpg" } },
            ],
          },
        },
      ],
    };
    assert.deepEqual([...fileIdsInContent(content)], [ID]);
    assert.deepEqual([...fileIdsInContent(JSON.stringify(content))], [ID]);
    assert.deepEqual(
      [...fileIdsInLink(`https://qrdx.dev/api/files/${ID}?download=1`)],
      [ID],
    );
    assert.equal(fileIdsInLink("https://qrdx.dev/api/files/short").size, 0);
  });

  it("validates sources and builds URLs per render mode", () => {
    assert.ok(FILE_ID_PATTERN.test(ID));
    const file = fileSourceSchema.parse({ type: "file", fileId: ID });
    assert.equal(sourceUrl(file, { mode: "preview" }), `/api/files/${ID}`);
    assert.match(
      sourceUrl(file, { mode: "live" }) ?? "",
      new RegExp(`^https?://[^/]+/api/files/${ID}$`),
    );
    assert.equal(
      sourceUrl(file, { mode: "preview" }, { download: true }),
      filePath(ID, { download: true }),
    );
    assert.equal(sourceUrl(null, { mode: "live" }), null);

    const link = fileSourceSchema.parse({
      type: "url",
      url: "https://cdn.test/docs/Menu%20Fall.pdf",
    });
    assert.equal(
      sourceUrl(link, { mode: "live" }),
      "https://cdn.test/docs/Menu%20Fall.pdf",
    );
    assert.equal(sourceName(link), "Menu Fall.pdf");

    assert.equal(
      fileSourceSchema.safeParse({ type: "url", url: "javascript:alert(1)" })
        .success,
      false,
    );
    assert.equal(
      fileSourceSchema.safeParse({ type: "file", fileId: "../../etc" }).success,
      false,
    );
  });
});
