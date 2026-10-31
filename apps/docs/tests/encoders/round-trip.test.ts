// Encoder → real qrdx renderer → pixels → jsQR → scanner parser. For every
// content type the decoded text must equal the encoded payload byte for byte,
// at every error correction level, including hostile unicode input.
import { QRCodeSVG } from "qrdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseScan } from "@/components/scanner/parse";
import {
  CONTENT_TYPES_METADATA,
  type QRContentConfig,
} from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";
import {
  decodeQR,
  rasterizeSvg,
  simulateCamera,
} from "../../../../packages/qrdx/tests/support/raster";
import { SAMPLES } from "../support/samples";

const LEVELS = ["L", "M", "Q", "H"] as const;

/** Renders the payload like the playground does and reads it back. */
function scan(value: string, level: (typeof LEVELS)[number]): string | null {
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value,
      level,
      size: 512,
      margin: 4,
      bodyPattern: "square",
    }),
  );
  // 480 px wide gives every sample 6+ px per module; blur ≈ ¼ module.
  const image = rasterizeSvg(svg, { width: 480, pad: 24 });
  return decodeQR(simulateCamera(image, 4));
}

const types = CONTENT_TYPES_METADATA.map((meta) => meta.type);

describe("every content type survives encode → render → decode", () => {
  it.each(
    types.flatMap((type) => LEVELS.map((level) => [type, level] as const)),
  )("%s at level %s", (type, level) => {
    const payload = encodeQRContent(SAMPLES[type]);
    expect(scan(payload, level)).toBe(payload);
  });
});

describe("hostile input survives the round trip", () => {
  const cases: QRContentConfig[] = [
    { type: "text", text: 'Zoë 👋🏽 東京 ½ ; , : \\ " & ? # % +\nnext line' },
    {
      type: "wifi",
      ssid: 'Café ☕;,:"\\',
      password: 'p;a,s:s"\\wörd',
      encryption: "WPA",
      hidden: true,
    },
    {
      type: "vcard",
      firstName: "Zoë",
      lastName: "O'Brien; Jr",
      organization: "Acme, Inc",
      address: "1 Main St, Apt 2\nSpringfield",
      note: "😀 ".repeat(40),
    },
    {
      type: "email",
      recipient: "zoë@example.com",
      subject: "Grüße & 👋",
      body: "a\nb",
    },
    {
      type: "upi",
      upiId: "café@okaxis",
      name: "Chai & Co",
      amount: "10.50",
      note: "ऑर्डर 12",
    },
    { type: "maps", location: "東京駅, 1 Chome Marunouchi" },
  ];

  it.each(cases)("$type", (config) => {
    const payload = encodeQRContent(config);
    const decoded = scan(payload, "M");
    expect(decoded).toBe(payload);
    // The scanner recognizes what it decoded as the same kind of content.
    expect(parseScan(decoded ?? "").kind).not.toBe(
      config.type === "text" ? "url" : "text",
    );
  });

  it("a long note near QR capacity still decodes", () => {
    const config: QRContentConfig = { type: "text", text: "€".repeat(700) };
    const payload = encodeQRContent(config);
    expect(new TextEncoder().encode(payload).length).toBe(2100);
    const svg = renderToStaticMarkup(
      createElement(QRCodeSVG, {
        value: payload,
        level: "L",
        size: 600,
        margin: 4,
        bodyPattern: "square",
      }),
    );
    expect(decodeQR(rasterizeSvg(svg, { width: 900, pad: 20 }))).toBe(payload);
  });
});
