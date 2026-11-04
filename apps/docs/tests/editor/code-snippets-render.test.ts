// Every image URL the Get code dialog writes (components/editor/action-bar/
// code-snippets.ts imageSnippet) renders on GET /v1/qr and scans: gradients,
// frames (custom ones too), borders, eye and dot colors and quick logo
// icons. The route runs in-process; nothing reaches the network.
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
const { IMAGE_API_URL, imageSnippet } = await import(
  "@/components/editor/action-bar/code-snippets"
);
const { logoIconDataUrl } = await import("@/lib/qr-design/logo");

const VALUE = "https://example.org/menu?table=4";
const frameSpec = OFFICIAL_FRAMES[0]?.spec;

const DESIGNS = {
  plain: {
    fgColor: "#1e3a8a",
    eyeColor: "#111111",
    dotColor: "#e11d48",
    bodyPattern: "rounded",
    cornerEyePattern: "extra-rounded",
    cornerEyeDotPattern: "circle",
    level: "M",
    margin: 2,
  },
  editorDefaults: {},
  gradients: {
    fgColor: {
      type: "linear",
      angle: 135,
      stops: [
        { color: "#1d4ed8", offset: 0 },
        { color: "#6d28d9", offset: 50 },
        { color: "#9d174d", offset: 100 },
      ],
    },
    bgColor: {
      type: "radial",
      stops: [
        { color: "#ffffff", offset: 0 },
        { color: "#eef2ff", offset: 100 },
      ],
    },
    margin: 4,
  },
  frameLabel: { frame: { style: "banner-bottom", text: "Scan the menu" } },
  frameColors: {
    frame: {
      style: "rounded-border",
      text: "Menu",
      color: "#1e3a8a",
      textColor: "#ffffff",
    },
  },
  customFrame: { frame: { style: "custom", spec: frameSpec, text: "Join" } },
  border: { templateId: "StandardBox", margin: 2 },
  icon: {
    level: "H",
    showLogo: true,
    customLogo: logoIconDataUrl("link"),
  },
} as const;

describe("Get code image URLs", () => {
  for (const [name, style] of Object.entries(DESIGNS)) {
    it(`${name}: renders and scans`, async () => {
      const { url, omitted } = imageSnippet({
        style: style as never,
        value: VALUE,
        contentType: "url",
        content: { type: "url", url: VALUE },
      });
      expect(omitted, name).toEqual([]);
      const local = url.replace(
        IMAGE_API_URL,
        "http://localhost:3000/api/v1/qr",
      );
      const response = await route.GET(new NextRequest(local));
      expect(response.status, await response.clone().text()).toBe(200);
      const svg = await response.text();
      expect(decodeQR(rasterizeSvg(svg, { width: 640, pad: 24 })), name).toBe(
        VALUE,
      );
    });
  }
});
