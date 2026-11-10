// The public MCP server (app/api/mcp/route.ts) as content/docs/developers/
// mcp.mdx describes it: stateless Streamable HTTP over POST, read-only QR
// tools, CORS for browser clients, a redirect to the connect page for people
// who open the URL, and a per-IP rate limit. Called in-process with JSON-RPC
// requests; the rendered codes are decoded back to check what they encode.
import { describe, expect, it, vi } from "vitest";
import {
  decodeQR,
  rasterizeSvg,
} from "../../../../packages/qrdx/tests/support/raster";

const state = vi.hoisted(() => ({ rateLimited: false }));

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.rateLimited,
      limit: 120,
      remaining: state.rateLimited ? 0 : 119,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const route = await import("@/app/api/mcp/route");

const URL_BASE = "http://localhost:3000/api/mcp";
const PROTOCOL = "2025-06-18";

let rpcId = 0;
async function rpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const response = await route.POST(
    new Request(URL_BASE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  const text = await response.text();
  // Streamable HTTP may answer with JSON or with a one-message SSE stream.
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return {
    response,
    message: json ? (JSON.parse(json) as Record<string, any>) : null,
  };
}

const call = (name: string, args: Record<string, unknown>) =>
  rpc("tools/call", { name, arguments: args });

describe("MCP over Streamable HTTP", () => {
  it("initializes with QRdx's server info and instructions", async () => {
    const { response, message } = await rpc("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    expect(response.status).toBe(200);
    expect(message?.result.serverInfo).toMatchObject({ name: "qrdx" });
    expect(message?.result.capabilities.tools).toBeDefined();
    expect(message?.result.instructions).toContain("generate_qr_code");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("lists the QR and barcode tools, all read-only but the save ones", async () => {
    const { message } = await rpc("tools/list");
    const tools = message?.result.tools as {
      name: string;
      inputSchema?: unknown;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        "design_qr",
        "get_community_item",
        "list_options",
        "generate_qr_code",
        "list_qr_styles",
        "qr_payload_email",
        "qr_payload_geo",
        "qr_payload_sms",
        "qr_payload_vcard",
        "qr_payload_wifi",
        "save_template",
        "search_community",
        "generate_barcode",
        "save_barcode",
      ].sort(),
    );
    for (const tool of tools) {
      // save_template and save_barcode write to the API key's workspace.
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(
        tool.name !== "save_template" && tool.name !== "save_barcode",
      );
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
  });

  it("generate_qr_code returns image URLs and a scannable SVG", async () => {
    const { message } = await call("generate_qr_code", {
      data: "https://qrdx.dev/?from=mcp",
      include_svg: true,
    });
    expect(message?.result.isError).toBeFalsy();
    const content = message?.result.content as {
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }[];
    const summary = content[0]?.text ?? "";
    expect(summary).toMatch(/SVG URL: https?:\/\/\S+\/v1\/qr\?/);
    expect(summary).toMatch(/PNG URL: \S+format=png/);
    expect(summary).toMatch(/EPS URL .*format=eps/);
    expect(summary).toContain("Markdown: ![QR code](");

    const image = content.find((part) => part.type === "image");
    expect(image?.mimeType).toBe("image/png");
    const png = Buffer.from(image?.data ?? "", "base64");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const svg = content.at(-1)?.text ?? "";
    expect(svg).toMatch(/^<svg/);
    expect(decodeQR(rasterizeSvg(svg, { width: 360, pad: 24 }))).toBe(
      "https://qrdx.dev/?from=mcp",
    );
  });

  it("the image URLs it returns encode the same data", async () => {
    const { message } = await call("generate_qr_code", { data: "hello mcp" });
    const summary = (message?.result.content[0]?.text as string) ?? "";
    const svgUrl = new URL(summary.match(/SVG URL: (\S+)/)?.[1] as string);
    expect(svgUrl.searchParams.get("data")).toBe("hello mcp");
  });

  it("reports data that can't fit in a QR code as a tool error, not a crash", async () => {
    const { response, message } = await call("generate_qr_code", {
      data: "x".repeat(2048),
      level: "H",
    });
    expect(response.status).toBe(200);
    expect(message?.result.isError).toBe(true);
    expect(message?.result.content[0]?.text).toMatch(/too (long|much)/i);
  });

  it("rejects invalid arguments", async () => {
    const { message } = await call("generate_qr_code", { data: "" });
    const failed =
      message?.error ?? (message?.result.isError ? message.result : null);
    expect(failed).toBeTruthy();
  });

  it("builds payloads phones understand", async () => {
    const wifi = await call("qr_payload_wifi", {
      ssid: "Cafe;Guest",
      password: "pa:ss;word",
    });
    const payload = wifi.message?.result.content[0]?.text as string;
    expect(payload).toMatch(/^WIFI:/);
    expect(payload).toContain("T:WPA;");
    // ; , : " and \ are escaped so phones read the fields correctly.
    expect(payload).toContain("S:Cafe\\;Guest;");
    expect(payload).toContain("P:pa\\:ss\\;word;");
    expect(payload.endsWith(";;")).toBe(true);

    // WPA passwords phones can't join with are refused up front.
    const tooShort = await call("qr_payload_wifi", {
      ssid: "Cafe",
      password: "short",
    });
    expect(tooShort.message?.result.isError).toBe(true);
    expect(tooShort.message?.result.content[0]?.text).toContain(
      "8-63 characters",
    );

    const geo = await call("qr_payload_geo", {
      latitude: 48.8584,
      longitude: 2.2945,
    });
    expect(geo.message?.result.content[0]?.text).toMatch(
      /^geo:48\.8584,2\.2945/,
    );
  });

  it("design_qr validates content, repairs the style to Great and returns JSON, PNG and SVG", async () => {
    const { message } = await call("design_qr", {
      content: {
        type: "wifi",
        ssid: "Cafe Guest",
        password: "sunshine123",
        encryption: "WPA",
      },
      style: {
        bgColor: "#FFF7ED",
        fgColor: "#FDBA74",
        bodyPattern: "circle",
        cornerEyePattern: "circle",
        frame: { style: "banner-bottom", text: "Free Wi-Fi" },
      },
    });
    expect(message?.result.isError).toBeFalsy();
    const content = message?.result.content as {
      type: string;
      text?: string;
      data?: string;
    }[];
    expect(content[0]?.text).toMatch(
      /^Scan score \d+\/100 \(great\) after \d repairs?\./,
    );
    expect(content[0]?.text).toContain("Content: WiFi · Cafe Guest");
    const design = JSON.parse(content[1]?.text as string);
    expect(design).toMatchObject({
      grade: "great",
      great: true,
      payload: "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
      style: {
        bgColor: "#FFF7ED",
        frame: { style: "banner-bottom", text: "Free Wi-Fi" },
      },
    });
    expect(design.score).toBeGreaterThanOrEqual(85);
    expect(design.repairs).toBeGreaterThan(0);
    expect(design.changes.length).toBeGreaterThan(0);
    // The pale orange dots were darkened, keeping their hue.
    expect(design.style.fgColor).not.toBe("#FDBA74");
    expect(design.style.cornerEyePattern).not.toBe("circle");

    const png = Buffer.from(
      content.find((part) => part.type === "image")?.data ?? "",
      "base64",
    );
    expect([...png.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
    const svg = content.at(-1)?.text ?? "";
    expect(svg).toMatch(/^<svg/);
    expect(decodeQR(rasterizeSvg(svg, { width: 480, pad: 24 }))).toBe(
      "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
    );
  });

  it("design_qr refuses content the editor's form would refuse", async () => {
    const { message } = await call("design_qr", {
      content: {
        type: "wifi",
        ssid: "Cafe",
        password: "short",
        encryption: "WPA",
      },
    });
    expect(message?.result.isError).toBe(true);
    expect(message?.result.content[0]?.text).toMatch(/8-63/);
  });

  it("list_options lists every content type, shape, frame and template", async () => {
    const { message } = await call("list_options", {});
    const options = JSON.parse(message?.result.content[0]?.text as string);
    expect(
      options.contentTypes.map((item: { type: string }) => item.type),
    ).toContain("vcard");
    expect(options.style.frames.styles).toContain("banner-bottom");
    expect(options.style.eyes).not.toContain("curly");
    expect(
      options.style.templates.map((item: { id: string }) => item.id),
    ).toContain("StandardBox");
    expect(options.scanScore).toMatchObject({ great: 85, maxRepairs: 3 });
  });

  it("lists styles as JSON", async () => {
    const { message } = await call("list_qr_styles", {});
    const catalog = JSON.parse(message?.result.content[0]?.text as string);
    expect(catalog).toBeTypeOf("object");
  });
});

describe("the MCP endpoint over HTTP", () => {
  it("answers CORS preflights", () => {
    const response = route.OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Mcp-Session-Id",
    );
  });

  it("sends people who open the URL to the connect page", async () => {
    const visit = (url: string) =>
      route.GET(new Request(url, { headers: { accept: "text/html,*/*" } }));
    const local = await visit(URL_BASE);
    expect(local.status).toBe(307);
    expect(local.headers.get("location")).toBe("http://localhost:3000/mcp");
    const hosted = await visit("https://mcp.qrdx.dev/mcp");
    expect(hosted.headers.get("location")).toBe("https://qrdx.dev/mcp");
  });

  it("rate limits per IP with 429, keeping CORS headers", async () => {
    state.rateLimited = true;
    try {
      const { response } = await rpc(
        "tools/list",
        {},
        { "x-real-ip": "203.0.113.9" },
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    } finally {
      state.rateLimited = false;
    }
  });
});
