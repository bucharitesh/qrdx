// The Telegram bot's JPEG route (app/api/integrations/telegram/photo): the
// Bot API takes only JPEG for inline photo results, so this serves the image
// API's default code as a real JPEG, for links the bot signed only. Each
// image is read back with sharp (libjpeg) and scanned with ZXing, so a
// broken encoder can't pass. The rate limiter runs in memory with its real
// window; the renderer is the real one, wrapped to count its calls.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123456:fake-token-for-tests";
  process.env.TELEGRAM_WEBHOOK_SECRET = "fake_webhook_secret-1";
  process.env.TELEGRAM_BOT_USERNAME = "QRdxTestBot";
});

const state = vi.hoisted(() => ({ generation: 0, keys: [] as string[] }));

vi.mock("@/lib/chat-bots/telegram/jpeg", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/chat-bots/telegram/jpeg")>();
  return { renderQrJpeg: vi.fn(actual.renderQrJpeg) };
});

vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    createRateLimiter: ({
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
    }) => {
      // A fresh window for every test (state.generation).
      let generation = -1;
      let memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string) => {
          if (generation !== state.generation) {
            generation = state.generation;
            memory = createMemoryLimiter(limiter);
          }
          state.keys.push(key);
          return memory.limit(key);
        },
      };
    },
  };
});

import { GET } from "@/app/api/integrations/telegram/photo/route";
import { renderQrJpeg } from "@/lib/chat-bots/telegram/jpeg";
import {
  PHOTO_LINK_MAX_SECONDS,
  photoLinkExpiry,
  photoLinkSignature,
  verifyPhotoLink,
} from "@/lib/chat-bots/telegram/photo-link";
import { telegramPhotoUrl } from "@/lib/chat-bots/telegram/replies";

const SECRET = "fake_webhook_secret-1";
const PHOTO = "http://localhost:3000/api/integrations/telegram/photo";

/** A link the bot would make now, on this test server. */
const signed = (data: string, size: number, now?: number) =>
  telegramPhotoUrl(data, size, {
    secret: SECRET,
    origin: "http://localhost:3000",
    now,
  });

/** `url` with one query value changed (or removed, with null). */
function withParam(url: string, name: string, value: string | null) {
  const next = new URL(url);
  if (value === null) next.searchParams.delete(name);
  else next.searchParams.set(name, value);
  return next.toString();
}

/** A link with its own signature over any values, for cases the bot never makes. */
function signedWith(data: string, size: string, exp: number) {
  const url = new URL(PHOTO);
  url.searchParams.set("data", data);
  url.searchParams.set("size", size);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", photoLinkSignature(data, size, exp, SECRET));
  return url.toString();
}

const renders = vi.mocked(renderQrJpeg);

beforeEach(() => {
  state.generation += 1;
  state.keys = [];
  renders.mockClear();
});

// The ponyfill builds a DOMRectReadOnly for each result; Node has none.
(globalThis as { DOMRectReadOnly?: unknown }).DOMRectReadOnly ??= class {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
};

let detector: BarcodeDetector;

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const fromDetector = createRequire(
    require.resolve("barcode-detector/ponyfill"),
  );
  const wasm = readFileSync(
    fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ) as ArrayBuffer,
    },
    fireImmediately: true,
  });
  detector = new BarcodeDetector({ formats: ["qr_code"] });
});

let ip = 0;

function get(url: string, clientIp = `203.0.113.${(ip++ % 200) + 1}`) {
  return GET(new NextRequest(url, { headers: { "x-real-ip": clientIp } }));
}

async function scan(jpeg: Buffer): Promise<string[]> {
  const found = await detector.detect(
    new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
  );
  return found.map((code) => code.rawValue);
}

describe("GET /api/integrations/telegram/photo", () => {
  it.each([
    [256, "https://qrdx.dev/pricing?plan=pro&period=year"],
    [1024, "Wi-Fi: Lobby\nPassword: tulip-4471"],
  ])(
    "serves a %i px JPEG of a signed link that scans back to its content",
    async (size, data) => {
      const response = await get(signed(data, size));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      // The CDN keeps every image for good.
      for (const header of ["cache-control", "cdn-cache-control"]) {
        expect(response.headers.get(header)).toBe(
          "public, max-age=31536000, immutable",
        );
      }

      const jpeg = Buffer.from(await response.arrayBuffer());
      expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(jpeg.length).toBeLessThan(5 * 1024 * 1024); // the Bot API's limit
      const meta = await sharp(jpeg).metadata();
      expect(meta).toMatchObject({ format: "jpeg", width: size, height: size });
      expect(await scan(jpeg)).toEqual([data]);
      expect(renders).toHaveBeenCalledTimes(1);
    },
  );

  it("answers 403 without drawing anything when the signature is missing, changed or expired", async () => {
    const good = signed("https://qrdx.dev/menu", 256);
    const link = new URL(good);
    const sig = link.searchParams.get("sig") ?? "";
    const exp = Number(link.searchParams.get("exp"));
    const now = Math.floor(Date.now() / 1000);
    const flipped = `${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;

    const refused: [string, string][] = [
      ["tampered data", withParam(good, "data", "https://evil.example/menu")],
      [
        "data with a space added",
        withParam(good, "data", "https://qrdx.dev/menu "),
      ],
      ["tampered size", withParam(good, "size", "1024")],
      ["size outside the list", withParam(good, "size", "512")],
      ["size with a leading zero", withParam(good, "size", "0256")],
      ["tampered exp", withParam(good, "exp", String(exp - 60))],
      [
        "exp pushed past the longest link",
        withParam(good, "exp", String(exp + 3600)),
      ],
      ["changed signature", withParam(good, "sig", flipped)],
      [
        "signature from another secret",
        good.replace(
          sig,
          photoLinkSignature(
            "https://qrdx.dev/menu",
            256,
            exp,
            "another_secret",
          ),
        ),
      ],
      ["padded signature", withParam(good, "sig", `${sig}=`)],
      ["no sig", withParam(good, "sig", null)],
      ["no exp", withParam(good, "exp", null)],
      ["no size", withParam(good, "size", null)],
      ["no data", withParam(good, "data", null)],
      ["nothing at all", PHOTO],
      ["the old unsigned link", `${PHOTO}?data=hello&size=1024`],
      // Signed with the right key, but already expired...
      [
        "expired",
        signed("https://qrdx.dev/menu", 256, Date.now() - 3 * 3600_000),
      ],
      ["expired a second ago", signedWith("hello", "256", now - 1)],
      // ...or valid for longer than the bot ever makes links.
      [
        "too far ahead",
        signedWith("hello", "256", now + PHOTO_LINK_MAX_SECONDS + 60),
      ],
    ];
    for (const [label, url] of refused) {
      const response = await get(url);
      expect(response.status, label).toBe(403);
      expect(response.headers.get("cache-control"), label).toBe("no-store");
    }
    expect(renders).not.toHaveBeenCalled();
    // Refused before the rate limiter, too: junk can't fill its keys.
    expect(state.keys).toEqual([]);

    expect((await get(good)).status).toBe(200);
  });

  it("refuses signed content that isn't a QR code, and sizes it doesn't draw", async () => {
    for (const [data, size] of [
      ["hello", 512],
      ["hello", 1],
      ["  ", 256],
      ["a".repeat(2049), 1024],
      ["é".repeat(1500), 1024],
    ] as const) {
      const response = await get(signed(data, size));
      expect(response.status, `${data.slice(0, 10)} @ ${size}`).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(renders).not.toHaveBeenCalled();
  });

  it("limits each signed link to 10 draws a minute, from any address, and nothing else", async () => {
    // Size 1 is refused after the limiter, so nothing is drawn here.
    const link = signed("x", 1);
    for (let i = 0; i < 10; i++) {
      // Telegram's few fetch addresses, or someone getting around the cache.
      const busted = withParam(link, "cachebust", String(i));
      expect((await get(busted, `198.51.100.${i}`)).status).toBe(400);
    }
    const limited = await get(link, "198.51.100.200");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    const sig = new URL(link).searchParams.get("sig");
    expect(new Set(state.keys)).toEqual(new Set([`telegram-photo:sig:${sig}`]));

    // One address fetching many different links isn't held back.
    for (let i = 0; i < 400; i++) {
      expect((await get(signed(`code ${i}`, 1), "149.154.160.1")).status).toBe(
        400,
      );
    }
  });
});

describe("photo links", () => {
  it("are signed, and verify only with the bot's secret", () => {
    const url = new URL(signed("Table 4", 1024));
    expect([...url.searchParams.keys()]).toEqual([
      "data",
      "size",
      "exp",
      "sig",
    ]);
    expect(url.searchParams.get("sig")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyPhotoLink(url.searchParams, SECRET)).toEqual({
      data: "Table 4",
      size: 1024,
      sig: url.searchParams.get("sig"),
    });
    expect(verifyPhotoLink(url.searchParams, "another_secret")).toBeNull();
    expect(verifyPhotoLink(url.searchParams, "")).toBeNull();
  });

  it("expire at the next whole hour plus one, so a link stays the same for an hour", () => {
    const at = (time: string) => Date.parse(`2026-11-10T${time}Z`);
    const seconds = (time: string) => at(time) / 1000;
    expect(photoLinkExpiry(at("10:20:00"))).toBe(seconds("12:00:00"));
    expect(photoLinkExpiry(at("10:59:59.999"))).toBe(seconds("12:00:00"));
    expect(photoLinkExpiry(at("10:00:00.001"))).toBe(seconds("12:00:00"));
    expect(photoLinkExpiry(at("10:00:00"))).toBe(seconds("11:00:00"));

    // Valid for one to two hours.
    for (const time of [
      "10:00:00",
      "10:00:00.001",
      "10:30:00",
      "10:59:59.999",
    ]) {
      const left = photoLinkExpiry(at(time)) - at(time) / 1000;
      expect(left).toBeGreaterThanOrEqual(3600);
      expect(left).toBeLessThanOrEqual(PHOTO_LINK_MAX_SECONDS);
    }

    // Same code in the same hour: the same link, so the CDN serves it again.
    expect(signed("hello", 256, at("10:05:00"))).toBe(
      signed("hello", 256, at("10:55:00")),
    );
    expect(signed("hello", 256, at("11:05:00"))).not.toBe(
      signed("hello", 256, at("10:55:00")),
    );
  });
});
