// GET /v1/qr, as apps/docs/content/docs/developers/image-api.mdx describes it: the
// original parameters render exactly as before (cached for a year), and the
// editor's styles come in through `style` (JSON or a playground style value),
// `frame`/`frameText` and `logoIcon`, still keyless, deterministic and
// cached. Every styled code here is decoded back.
import { NextRequest } from "next/server";
import { OFFICIAL_FRAMES } from "qrdx";
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
const { renderQrSvg } = await import("@/lib/qr-render");
const { qrImageQuerySchema } = await import("@/app/api/v1/qr/_lib/query");
const { encodeStyleParam } = await import("@/lib/playground-style");

const IMMUTABLE = "public, max-age=31536000, immutable";
const get = (query: string) =>
  route.GET(new NextRequest(`http://localhost:3000/api/v1/qr?${query}`));
const q = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();
const decodes = (svg: string, width = 520) =>
  decodeQR(rasterizeSvg(svg, { width, pad: 24 }));

describe("the original parameters", () => {
  it("render byte for byte as the original renderer, cached for a year", async () => {
    const query =
      "data=https://qrdx.dev&size=256&fg=155dfc&body=rounded&eye=rounded&dot=rounded&template=Arrow";
    const response = await get(query);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(IMMUTABLE);
    const expected = renderQrSvg(
      qrImageQuerySchema.parse(Object.fromEntries(new URLSearchParams(query))),
    );
    expect(await response.text()).toBe(expected);
  });
});

describe("the editor's styles", () => {
  it("takes gradients, eye and dot colours, a border and a frame as style JSON", async () => {
    const style = {
      fgColor: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#1d4ed8", offset: 0 },
          { color: "#7c3aed", offset: 100 },
        ],
      },
      eyeColor: "#b91c1c",
      dotColor: "#111827",
      bodyPattern: "rounded",
      frame: { style: "banner-bottom", text: "See the menu" },
    };
    const response = await get(
      q({
        data: "https://qrdx.dev/menu",
        size: "300",
        style: JSON.stringify(style),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const svg = await response.text();
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("#b91c1c");
    // The frame adds to the code's 300 px.
    expect(Number(/height="([\d.]+)"/.exec(svg)?.[1])).toBeGreaterThan(300);
    expect(decodes(svg)).toBe("https://qrdx.dev/menu");
  });

  it("takes a playground link's style value and a custom frame spec", async () => {
    const frame = OFFICIAL_FRAMES.find((item) => item.id === "wifi-card");
    const encoded = encodeStyleParam({
      fgColor: "#14532d",
      cornerEyePattern: "rounded",
      frame: { style: "custom", spec: frame?.spec },
    } as never);
    expect(encoded?.omitted).toEqual([]);
    const response = await get(
      q({ data: "https://qrdx.dev/link", style: encoded?.value ?? "" }),
    );
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("#14532d");
    expect(decodes(svg, 640)).toBe("https://qrdx.dev/link");
  });

  it("adds a built-in frame and a quick logo icon from flat parameters", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/wifi",
        frame: "speech-bubble",
        frameText: "Join",
        logoIcon: "wifi",
        level: "H",
      }),
    );
    expect(response.status).toBe(200);
    const svg = await response.text();
    expect(svg).toContain("data-qrdx-icon%3D%22wifi%22");
    expect(decodes(svg)).toBe("https://qrdx.dev/wifi");
  });

  it("flat parameters win over style", async () => {
    const response = await get(
      q({
        data: "x",
        fg: "0f172a",
        style: JSON.stringify({ fgColor: "#ff0000" }),
      }),
    );
    const svg = await response.text();
    expect(svg).toContain("#0f172a");
    expect(svg).not.toContain("#ff0000");
  });

  it("raises error correction for a logo, so a small code still scans", async () => {
    const response = await get(
      q({ data: "https://qrdx.dev/gen", size: "320", logoIcon: "link" }),
    );
    expect(decodes(await response.text())).toBe("https://qrdx.dev/gen");
  });

  it("sizes PNG and EPS to the frame", async () => {
    const png = await get(
      q({ data: "x", size: "200", format: "png", frame: "border" }),
    );
    expect(png.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await png.arrayBuffer());
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(200);
    const eps = await get(q({ data: "x", format: "eps", frame: "border" }));
    expect(eps.headers.get("content-type")).toBe("application/postscript");
    expect((await eps.text()).startsWith("%!PS")).toBe(true);
  });

  it("names every problem, keeps CORS and never caches errors", async () => {
    const cases: [Record<string, string>, string, RegExp][] = [
      [
        { style: JSON.stringify({ customLogo: "https://x.example/l.png" }) },
        "style.customLogo",
        /logoFileId/,
      ],
      [{ style: JSON.stringify({ art: {} }) }, "style.art", /art/],
      [
        { style: JSON.stringify({ fgColor: "url(#x)" }) },
        "style.fgColor",
        /colour/,
      ],
      [{ style: JSON.stringify({ colour: "#000" }) }, "style", /Unrecognized/],
      [{ style: "{oops" }, "style", /JSON/],
      [{ frameText: "Hi" }, "frameText", /no frame/],
      [{ frame: "nope" }, "frame", /./],
      [{ logoIcon: "skull" }, "logoIcon", /./],
    ];
    for (const [params, param, message] of cases) {
      const response = await get(q({ data: "x", ...params }));
      expect(response.status, param).toBe(400);
      expect(response.headers.get("cache-control"), param).toBe("no-store");
      expect(response.headers.get("access-control-allow-origin"), param).toBe(
        "*",
      );
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.data.details[0], param).toMatchObject({ param });
      expect(body.data.details[0].message, param).toMatch(message);
    }
  });
});

describe("WebP", () => {
  const pixels = async (response: Response) => {
    const { default: sharp } = await import("sharp");
    const bytes = Buffer.from(await response.arrayBuffer());
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { bytes, data: new Uint8ClampedArray(data), info };
  };
  const isLosslessWebp = (bytes: Buffer) =>
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 16) === "WEBPVP8L";

  it("is the PNG's pixels, lossless and smaller, with the same caching", async () => {
    const query = { data: "https://qrdx.dev/webp", size: "300", fg: "155dfc" };
    const [webp, png] = await Promise.all([
      get(q({ ...query, format: "webp" })),
      get(q({ ...query, format: "png" })),
    ]);
    expect(webp.status).toBe(200);
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect(webp.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(webp.headers.get("cdn-cache-control")).toBe(IMMUTABLE);
    expect(webp.headers.get("access-control-allow-origin")).toBe("*");
    const fromWebp = await pixels(webp);
    const fromPng = await pixels(png);
    expect(isLosslessWebp(fromWebp.bytes)).toBe(true);
    expect([fromWebp.info.width, fromWebp.info.height]).toEqual([300, 300]);
    expect(
      Buffer.compare(Buffer.from(fromWebp.data), Buffer.from(fromPng.data)),
    ).toBe(0);
    expect(fromWebp.bytes.length).toBeLessThan(fromPng.bytes.length);
    expect(decodeQR({ data: fromWebp.data, width: 300, height: 300 })).toBe(
      "https://qrdx.dev/webp",
    );
  });

  it("takes WEBP in any case, and styles, frames and a transparent background", async () => {
    const response = await get(
      q({
        data: "https://qrdx.dev/styled",
        size: "240",
        format: "WEBP",
        frame: "border",
        style: JSON.stringify({ bgColor: "transparent" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    const { bytes, data, info } = await pixels(response);
    expect(isLosslessWebp(bytes)).toBe(true);
    // The frame makes it larger than the code.
    expect(info.width).toBeGreaterThan(240);
    const alphas = new Set<number>();
    for (let index = 3; index < data.length; index += 4) {
      alphas.add(data[index] as number);
    }
    expect(alphas.has(0)).toBe(true);
    expect(alphas.has(255)).toBe(true);
  });
});
