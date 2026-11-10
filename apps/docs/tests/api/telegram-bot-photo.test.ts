// The Telegram bot's JPEG route (app/api/integrations/telegram/photo): the
// Bot API takes only JPEG for inline photo results, so this serves the image
// API's default code as a real JPEG. Each image is read back with sharp
// (libjpeg) and scanned with ZXing, so a broken encoder can't pass. The rate
// limiter runs in memory with its real window.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = "123456:fake-token-for-tests";
  process.env.TELEGRAM_WEBHOOK_SECRET = "fake_webhook_secret-1";
  process.env.TELEGRAM_BOT_USERNAME = "QRdxTestBot";
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
    }) => createMemoryLimiter(limiter),
  };
});

import { GET } from "@/app/api/integrations/telegram/photo/route";
import { telegramPhotoUrl } from "@/lib/chat-bots/telegram/replies";

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
    "serves a %i px JPEG that scans back to its content",
    async (size, data) => {
      const response = await get(
        telegramPhotoUrl(data, size, "http://localhost:3000"),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("cache-control")).toContain("immutable");

      const jpeg = Buffer.from(await response.arrayBuffer());
      expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(jpeg.length).toBeLessThan(5 * 1024 * 1024); // the Bot API's limit
      const meta = await sharp(jpeg).metadata();
      expect(meta).toMatchObject({ format: "jpeg", width: size, height: size });
      expect(await scan(jpeg)).toEqual([data]);
    },
  );

  it("defaults to the full size", async () => {
    const response = await get(
      "http://localhost:3000/api/integrations/telegram/photo?data=hello",
    );
    const meta = await sharp(
      Buffer.from(await response.arrayBuffer()),
    ).metadata();
    expect(meta.width).toBe(1024);
  });

  it("refuses other sizes and content that isn't a QR code", async () => {
    const base = "http://localhost:3000/api/integrations/telegram/photo";
    for (const query of [
      "?data=hello&size=512",
      "?data=hello&size=abc",
      "?data=%20%20",
      "",
      `?data=${"a".repeat(2049)}`,
      `?data=${encodeURIComponent("é".repeat(1500))}`,
    ]) {
      const response = await get(`${base}${query}`);
      expect(response.status, query.slice(0, 30)).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("rate limits by client IP", async () => {
    const url =
      "http://localhost:3000/api/integrations/telegram/photo?data=x&size=1";
    for (let i = 0; i < 300; i++) {
      expect((await get(url, "198.51.100.7")).status).toBe(400);
    }
    const limited = await get(url, "198.51.100.7");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await get(url, "198.51.100.8")).status).toBe(400);
  });
});
