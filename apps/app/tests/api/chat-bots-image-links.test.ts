// The image links the chat bots send (lib/chat-bots/styles.ts), through the
// real image API route (GET /v1/qr): every look, with a frame and a logo,
// and a typed color, renders as a PNG that decodes back to its content,
// after the bots' scan check. Nothing reaches the network.

import { NextRequest } from "next/server";
import { decodePNGPixels } from "qrdx";
import { describe, expect, it, vi } from "vitest";
import { decodeQR } from "../../../../packages/qrdx/tests/support/raster";

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

const route = await import("@/app/api/v1/qr/route");
const { applyChoice, CHAT_LOOKS, chatDesignLinks, checkChatDesign } =
  await import("@/lib/chat-bots/styles");

const DATA = "https://qrdx.dev/menu";

async function decoded(link: string) {
  const url = new URL(link);
  // The route reads only the query; it's served at api.qrdx.dev/v1/qr.
  const response = await route.GET(
    new NextRequest(`http://localhost:3000/api/v1/qr${url.search}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  const png = await decodePNGPixels(
    new Uint8Array(await response.arrayBuffer()),
  );
  if (!png) throw new Error("not a PNG");
  return decodeQR({
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  });
}

describe("the bots' image links", () => {
  it.each(CHAT_LOOKS.map((look) => look.id))(
    "%s, with a frame and a logo, renders and scans",
    async (look) => {
      const asked = applyChoice(null, {
        look,
        frame: "banner-bottom",
        frameText: "Menu",
        logo: "wifi",
      });
      const { design } = await checkChatDesign(DATA, asked);
      const links = chatDesignLinks(DATA, design);
      expect(new URL(links.png).searchParams.get("logoIcon")).toBe("wifi");
      expect(await decoded(links.png)).toBe(DATA);
    },
  );

  it("renders a typed color and shapes, and the SVG link answers too", async () => {
    const asked = applyChoice(null, {
      fg: "#0051FF",
      body: "circle",
      eye: "rounded",
      dot: "rounded",
      template: "Arrow",
    });
    const { design } = await checkChatDesign(DATA, asked);
    const links = chatDesignLinks(DATA, design);
    expect(await decoded(links.png)).toBe(DATA);
    const svg = await route.GET(
      new NextRequest(
        `http://localhost:3000/api/v1/qr${new URL(links.svg).search}`,
      ),
    );
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toBe("image/svg+xml");
  });
});
