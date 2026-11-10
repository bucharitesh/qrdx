// The QR card for MCP Apps hosts (app/api/mcp/qr-card.ts): design_qr and
// generate_qr_code link to a ui:// resource, resources/read serves it as an
// MCP App with CSP metadata for the image API host only, and the card's data
// rides in the result's _meta so clients without MCP Apps get the same text
// and images as before. Called in-process with JSON-RPC, like mcp.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 120,
      remaining: 119,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/mcp/route");
const {
  cardImageUrl,
  describePayload,
  MCP_APP_MIME_TYPE,
  QR_CARD_META_KEY,
  QR_CARD_URI,
  qrCardResourceMeta,
} = await import("@/app/api/mcp/qr-card");
const { QR_CARD_HTML } = await import("@/app/api/mcp/qr-card-html");
const { MCP_SERVER_INFO } = await import("@/app/api/mcp/tools");

const PROTOCOL = "2025-06-18";
const UI_TOOLS = ["design_qr", "generate_qr_code"];

let rpcId = 0;
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return JSON.parse(json) as Record<string, any>;
}

const call = (name: string, args: Record<string, unknown>) =>
  rpc("tools/call", { name, arguments: args });

describe("MCP Apps: the QR card", () => {
  it("initializes with resources and the new server version", async () => {
    const message = await rpc("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/ui": { mimeTypes: [MCP_APP_MIME_TYPE] },
        },
      },
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    expect(message.result.capabilities.resources).toBeDefined();
    expect(message.result.capabilities.tools).toBeDefined();
    expect(message.result.serverInfo).toEqual(MCP_SERVER_INFO);
    expect(MCP_SERVER_INFO.version).toBe("1.2.0");
  });

  it("links exactly the QR-producing tools to the card", async () => {
    const { result } = await rpc("tools/list");
    const tools = result.tools as {
      name: string;
      _meta?: Record<string, any>;
    }[];
    const linked = tools
      .filter((tool) => tool._meta?.ui?.resourceUri)
      .map((tool) => tool.name)
      .sort();
    expect(linked).toEqual(UI_TOOLS);
    for (const tool of tools) {
      if (!UI_TOOLS.includes(tool.name)) {
        expect(tool._meta, tool.name).toBeUndefined();
        continue;
      }
      expect(tool._meta).toEqual({
        ui: { resourceUri: QR_CARD_URI },
        "ui/resourceUri": QR_CARD_URI,
      });
    }
  });

  it("lists the card as an MCP App resource with CSP for the image API only", async () => {
    const { result } = await rpc("resources/list");
    const resources = result.resources as Record<string, any>[];
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      uri: "ui://qrdx/qr-card",
      name: "qr_card",
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          csp: { resourceDomains: ["https://api.qrdx.dev"] },
          prefersBorder: true,
        },
      },
    });
    // Nothing else is allowed: no fetch/XHR, frames or base URIs.
    expect(Object.keys(resources[0]?._meta.ui.csp)).toEqual([
      "resourceDomains",
    ]);
  });

  it("serves the card's HTML with the MCP App MIME type and CSP on the content", async () => {
    const { result } = await rpc("resources/read", { uri: QR_CARD_URI });
    expect(result.contents).toHaveLength(1);
    const [content] = result.contents as Record<string, any>[];
    expect(content).toMatchObject({
      uri: QR_CARD_URI,
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          csp: { resourceDomains: ["https://api.qrdx.dev"] },
          prefersBorder: true,
        },
      },
    });
    expect(content?.text).toBe(QR_CARD_HTML);
  });

  it("generate_qr_code keeps its text and image, and carries the card in _meta", async () => {
    const { result } = await call("generate_qr_code", {
      data: "https://qrdx.dev/?from=card",
      fg: "155dfc",
    });
    expect(result.isError).toBeFalsy();
    // Clients without MCP Apps see the same two parts as before, and no
    // structuredContent that some clients would show the model instead.
    expect(result.content.map((part: { type: string }) => part.type)).toEqual([
      "text",
      "image",
    ]);
    expect(result.structuredContent).toBeUndefined();
    const summary = result.content[0].text as string;
    const textSvgUrl = summary.match(/SVG URL: (\S+)/)?.[1] as string;
    expect(textSvgUrl).toContain("/api/v1/qr?");

    const card = result._meta[QR_CARD_META_KEY];
    expect(card).toMatchObject({
      encodes: "URL · https://qrdx.dev/?from=card",
      fileName: "qr-code",
    });
    expect(card.details).toEqual(["512 × 512 px", "Error correction Q"]);
    // The same image on the image API's public host, which the CSP allows.
    const svg = new URL(card.svg);
    expect(svg.origin + svg.pathname).toBe("https://api.qrdx.dev/v1/qr");
    expect(svg.search).toBe(new URL(textSvgUrl).search);
    expect(svg.searchParams.get("data")).toBe("https://qrdx.dev/?from=card");
    expect(new URL(card.png).searchParams.get("format")).toBe("png");
    // The editor link carries the style, never the content.
    const editor = new URL(card.editor);
    expect(editor.pathname).toBe("/playground");
    expect(editor.searchParams.get("style")).toMatch(/^1\./);
    expect(card.editor).not.toContain("qrdx.dev%2F%3Ffrom");
    expect(editor.hash).toBe("");
  });

  it("a styled generate_qr_code keeps public URLs on the image API host", async () => {
    const { result } = await call("generate_qr_code", {
      data: "WIFI:T:WPA;S:Cafe\\;Guest;P:sunshine123;;",
      frame: "banner-bottom",
      frameText: "Free Wi-Fi",
      size: 400,
    });
    const card = result._meta[QR_CARD_META_KEY];
    // The network name, never the password.
    expect(card.encodes).toBe("WiFi · Cafe;Guest");
    expect(JSON.stringify(card.details)).not.toContain("sunshine");
    expect(card.details[0]).toBe("400 px plus its frame");
    expect(new URL(card.svg).searchParams.get("frame")).toBe("banner-bottom");
    expect(card.svg.startsWith("https://api.qrdx.dev/v1/qr?")).toBe(true);
    expect(card.editor).toMatch(/\/playground\?style=1\./);
  });

  it("doesn't state an error correction level a logo may raise", async () => {
    const { result } = await call("generate_qr_code", {
      data: "https://example.com",
      logoIcon: "link",
    });
    const card = result._meta[QR_CARD_META_KEY];
    expect(card.details).toEqual(["512 px", "With a logo"]);
    expect(result.content[0].text).toContain("(raised to H when the logo");
  });

  it("design_qr carries a card with the scan score and its playground link, no image URLs", async () => {
    const { result } = await call("design_qr", {
      content: {
        type: "wifi",
        ssid: "Cafe Guest",
        password: "sunshine123",
        encryption: "WPA",
      },
      style: { fgColor: "#14532D" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    // Its SVG comes back by default; the card saves it from there.
    expect(result.content.map((part: { type: string }) => part.type)).toEqual([
      "text",
      "text",
      "image",
      "text",
    ]);
    expect(result.content[3].text).toMatch(/^<svg/);
    const design = JSON.parse(result.content[1].text);
    const card = result._meta[QR_CARD_META_KEY];
    expect(card).toEqual({
      encodes: "WiFi · Cafe Guest",
      details: [`Scan score ${design.score}/100 (${design.grade})`, "512 px"],
      svg: null,
      png: null,
      editor: design.playground_url,
      fileName: "qr-code",
    });
  });

  it("tool errors carry no card", async () => {
    const { result } = await call("generate_qr_code", {
      data: "x".repeat(2048),
      level: "H",
    });
    expect(result.isError).toBe(true);
    expect(result._meta?.[QR_CARD_META_KEY]).toBeUndefined();
  });

  it("other tools are unchanged: no _meta on their results", async () => {
    const { result } = await call("qr_payload_geo", {
      latitude: 48.8584,
      longitude: 2.2945,
    });
    expect(result._meta).toBeUndefined();
  });
});

describe("the card's HTML", () => {
  it("is one self-contained document: no external scripts, styles, fonts or URLs", () => {
    expect(QR_CARD_HTML.startsWith("<!doctype html>")).toBe(true);
    expect(QR_CARD_HTML).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(QR_CARD_HTML).not.toMatch(/<link\b/i);
    const css = QR_CARD_HTML.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toMatch(/@import|@font-face|url\(/i);
    // No address of any kind: the image URL comes from the tool result.
    expect(QR_CARD_HTML).not.toMatch(/https?:\/\//i);
    expect(QR_CARD_HTML).toContain('<meta name="color-scheme"');
    expect(QR_CARD_HTML.match(/<script\b/gi)).toHaveLength(1);
    // Small enough to inline in every resources/read.
    expect(new TextEncoder().encode(QR_CARD_HTML).length).toBeLessThan(20_000);
  });

  it("never writes markup from a tool result", () => {
    expect(QR_CARD_HTML).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(QR_CARD_HTML).not.toMatch(/document\.write|\beval\(|new Function/);
  });
});

describe("card helpers", () => {
  it("allows the instance's own origin for images when self-hosted", () => {
    const deployment = { appUrl: "https://qr.example.com" };
    expect(qrCardResourceMeta("https://qr.example.com", deployment)).toEqual({
      ui: {
        csp: { resourceDomains: ["https://qr.example.com"] },
        prefersBorder: true,
      },
    });
    expect(
      cardImageUrl(
        "https://qr.example.com/api/v1/qr?data=hi&format=png",
        "https://qr.example.com",
        deployment,
      ),
    ).toBe("https://qr.example.com/api/v1/qr?data=hi&format=png");
  });

  it("uses api.qrdx.dev wherever QRdx itself runs", () => {
    for (const origin of ["https://qrdx.dev", "http://localhost:3000"]) {
      expect(qrCardResourceMeta(origin, {}).ui.csp.resourceDomains).toEqual([
        "https://api.qrdx.dev",
      ]);
      expect(cardImageUrl(`${origin}/api/v1/qr?data=a%26b`, origin, {})).toBe(
        "https://api.qrdx.dev/v1/qr?data=a%26b",
      );
    }
  });

  it("describes raw payloads the way design_qr describes content", () => {
    expect(describePayload("https://example.com/menu")).toBe(
      "URL · https://example.com/menu",
    );
    expect(describePayload("WIFI:T:WPA;P:pa\\;S:ss;S:Office Guest;;")).toBe(
      "WiFi · Office Guest",
    );
    expect(
      describePayload("BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nEND:VCARD"),
    ).toBe("Contact · Ada Lovelace");
    expect(describePayload("mailto:ada%40example.com?subject=Hi")).toBe(
      "Email · ada@example.com",
    );
    expect(describePayload("sms:+15551234567?body=Hi")).toBe(
      "SMS · +15551234567",
    );
    expect(describePayload("SMSTO:+15551234567:Hi")).toBe("SMS · +15551234567");
    expect(describePayload("tel:+15551234567")).toBe("Phone · +15551234567");
    expect(describePayload("geo:48.8584,2.2945")).toBe(
      "Location · 48.8584, 2.2945",
    );
    expect(describePayload("hello\nworld")).toBe("Plain Text · hello");
    expect(describePayload("x".repeat(60))).toBe(
      `Plain Text · ${"x".repeat(39)}…`,
    );
  });
});
