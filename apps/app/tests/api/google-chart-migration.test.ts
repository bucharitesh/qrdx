// apps/docs/content/docs/developers/google-chart-api.mdx: the Perl one-liner it prints
// rewrites old Google Chart QR URLs as it says, and the image API renders
// the rewritten URLs (leftover cht and choe ignored) as codes that decode to
// the same data.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  decodeQR,
  rasterizeSvg,
} from "../../../../packages/qrdx/tests/support/raster";

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 300,
      remaining: 299,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/v1/qr/route");

const GUIDE = join(
  import.meta.dirname,
  "../../../docs/content/docs/developers/google-chart-api.mdx",
);

/** The `-e` program of the guide's `perl -pi -e '…' index.html` line. */
function guideScript(): string {
  const line = readFileSync(GUIDE, "utf8")
    .split("\n")
    .find((text) => text.startsWith("perl -pi -e '"));
  const match = line?.match(/^perl -pi -e '(.+)' index\.html$/);
  if (!match?.[1]) throw new Error("No perl one-liner in the guide");
  return match[1];
}

function migrate(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "qrdx-gchart-"));
  const file = join(dir, "index.html");
  writeFileSync(file, source);
  execFileSync("perl", ["-pi", "-e", guideScript(), file]);
  return readFileSync(file, "utf8");
}

/** GET /v1/qr with a URL's query, or with a bare query string. */
const get = (url: string) => {
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : url;
  return route.GET(new NextRequest(`http://localhost:3000/api/v1/qr?${query}`));
};

describe("the Google Chart migration one-liner", () => {
  it("rewrites the host, chl, chs and chld, and asks for PNG", () => {
    const before = [
      '<img src="https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=https%3A%2F%2Fexample.com&chld=M|2" alt="QR">',
      "<img src='http://chart.apis.google.com/chart?chs=150x150&cht=qr&chl=Hello%20world&choe=UTF-8'>",
      '<a href="https://chart.googleapis.com/chart?cht=qr&amp;chs=200x200&amp;chl=hi&amp;chld=H%7C0">QR</a>',
      '=IMAGE("https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl="&ENCODEURL(A2))',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: JavaScript source as input
      "const src = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(link)}`;",
      "(https://chart.googleapis.com/chart?cht=qr&chl=x&chs=99x99&chld=L)",
      "https://example.com/?chl=keep&chs=1x1",
    ].join("\n");
    expect(migrate(before).split("\n")).toEqual([
      '<img src="https://api.qrdx.dev/v1/qr?format=png&cht=qr&size=300&data=https%3A%2F%2Fexample.com&level=M&margin=2" alt="QR">',
      "<img src='https://api.qrdx.dev/v1/qr?format=png&size=150&cht=qr&data=Hello%20world&choe=UTF-8'>",
      '<a href="https://api.qrdx.dev/v1/qr?format=png&cht=qr&amp;size=200&amp;data=hi&amp;level=H&margin=0">QR</a>',
      '=IMAGE("https://api.qrdx.dev/v1/qr?format=png&size=150&cht=qr&data="&ENCODEURL(A2))',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: JavaScript source as input
      "const src = `https://api.qrdx.dev/v1/qr?format=png&cht=qr&size=200&data=${encodeURIComponent(link)}`;",
      "(https://api.qrdx.dev/v1/qr?format=png&cht=qr&data=x&size=99&level=L)",
      // Other sites' chl and chs stay as they are.
      "https://example.com/?chl=keep&chs=1x1",
    ]);
  });
});

describe("the migrated URLs", () => {
  it("render as PNG, with the old cht and choe ignored", async () => {
    const response = await get(
      "https://api.qrdx.dev/v1/qr?format=png&size=150&cht=qr&data=Hello%20world&choe=UTF-8",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it.each([
    [
      "https://api.qrdx.dev/v1/qr?cht=qr&size=300&data=https%3A%2F%2Fexample.com&level=M&margin=2",
      "https://example.com",
    ],
    [
      "https://api.qrdx.dev/v1/qr?size=150&cht=qr&data=Hello%20world&choe=UTF-8",
      "Hello world",
    ],
  ])("%s encodes the same data", async (url, data) => {
    const response = await get(url);
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(decodeQR(rasterizeSvg(svg, { width: 520, pad: 24 }))).toBe(data);
  });

  it("keeps the margin chld asked for", async () => {
    const wide = await (await get("data=x&level=M&margin=2")).text();
    const tight = await (await get("data=x&level=M&margin=0")).text();
    // Modules across the 512 px image: the code plus a margin on each side.
    const cells = (svg: string) =>
      Math.round(
        512 / Number(svg.match(/<g [^>]*><rect height="([\d.]+)"/)?.[1]),
      );
    expect(cells(tight)).toBe(21);
    expect(cells(wide)).toBe(25);
  });

  it("refuses a size under 64 pixels, as the guide warns", async () => {
    const response = await get("data=x&size=50");
    expect(response.status).toBe(400);
  });
});
