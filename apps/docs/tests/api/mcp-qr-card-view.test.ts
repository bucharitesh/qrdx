// The QR card's own script (app/api/mcp/qr-card-html.ts) against a pretend
// MCP Apps host: it runs in a node:vm context with a small fake DOM, and the
// test plays the host side of the postMessage JSON-RPC protocol (SEP-1865,
// 2026-01-26): ui/initialize, initialized, tool-result, host-context-changed,
// open-link, download-file, size-changed, ping and teardown.
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { QR_CARD_HTML } from "@/app/api/mcp/qr-card-html";

const SCRIPT = QR_CARD_HTML.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
const CARD_KEY = "dev.qrdx/qr-card";

class FakeStyle {
  values = new Map<string, string>();
  colorScheme = "";
  height = "";
  setProperty(name: string, value: string) {
    this.values.set(name, value);
  }
}

class FakeElement {
  textContent = "";
  alt = "";
  style = new FakeStyle();
  attributes = new Map<string, string>();
  listeners = new Map<string, (() => void)[]>();
  constructor(
    readonly id: string,
    public hidden = false,
  ) {}
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  getBoundingClientRect() {
    return { width: 400, height: 220 };
  }
}

/** Every element with an id in the card's HTML, hidden as the markup says. */
function elementsOf(html: string) {
  const elements = new Map<string, FakeElement>();
  for (const [, attributes = ""] of html.matchAll(/<\w+([^>]*)>/g)) {
    const id = attributes.match(/\sid="([^"]+)"/)?.[1];
    if (id) {
      elements.set(id, new FakeElement(id, /\shidden(\s|$)/.test(attributes)));
    }
  }
  return elements;
}

type Message = Record<string, any>;

function loadCard(options: { openai?: unknown } = {}) {
  const sent: Message[] = [];
  const parent = {
    postMessage(message: unknown, target: string) {
      expect(target).toBe("*");
      sent.push(JSON.parse(JSON.stringify(message)));
    },
  };
  const listeners: ((event: unknown) => void)[] = [];
  const elements = elementsOf(QR_CARD_HTML);
  const documentElement = new FakeElement("html");
  const window = {
    parent,
    innerWidth: 400,
    openai: options.openai,
    addEventListener(type: string, listener: (event: unknown) => void) {
      if (type === "message") listeners.push(listener);
    },
  };
  const document = {
    documentElement,
    body: new FakeElement("body"),
    getElementById: (id: string) => elements.get(id) ?? null,
  };
  vm.runInContext(
    SCRIPT,
    vm.createContext({
      window,
      document,
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 1;
      },
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      },
    }),
  );
  const fromHost = (data: Message, source: unknown = parent) => {
    for (const listener of listeners) listener({ source, data });
  };
  const el = (id: string) => elements.get(id) as FakeElement;
  return { sent, el, documentElement, fromHost };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const methods = (sent: Message[]) => sent.map((message) => message.method);

async function connected(
  hostCapabilities: Record<string, unknown> = { openLinks: {} },
  options: { openai?: unknown } = {},
) {
  const card = loadCard(options);
  card.fromHost({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2026-01-26",
      hostInfo: { name: "test-host", version: "1.0.0" },
      hostCapabilities,
      hostContext: { theme: "light" },
    },
  });
  await flush();
  return card;
}

const generateResult = (card: Record<string, unknown> = {}) => ({
  content: [
    { type: "text", text: "QR code, 512x512px, error correction Q." },
    { type: "image", mimeType: "image/png", data: PNG },
  ],
  _meta: {
    [CARD_KEY]: {
      encodes: "URL · https://example.com/menu",
      details: ["512 × 512 px", "Error correction Q"],
      svg: "https://api.qrdx.dev/v1/qr?data=https%3A%2F%2Fexample.com%2Fmenu",
      png: "https://api.qrdx.dev/v1/qr?data=https%3A%2F%2Fexample.com%2Fmenu&format=png",
      editor: "https://qrdx.dev/playground?style=1.abc",
      fileName: "qr-code",
      ...card,
    },
  },
});

const designResult = () => ({
  content: [
    { type: "text", text: "Scan score 92/100 (great)." },
    { type: "text", text: "{}" },
    { type: "image", mimeType: "image/png", data: PNG },
    { type: "text", text: SVG },
  ],
  _meta: {
    [CARD_KEY]: {
      encodes: "WiFi · Cafe Guest",
      details: ["Scan score 92/100 (great)", "512 px"],
      svg: null,
      png: null,
      editor: "https://qrdx.dev/playground?style=1.def",
      fileName: "qr-code",
    },
  },
});

describe("the QR card view", () => {
  it("starts with ui/initialize and sends nothing else until the host answers", () => {
    const card = loadCard();
    expect(card.sent).toEqual([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "ui/initialize",
        params: {
          appInfo: { name: "qrdx-qr-card", version: "1.0.0" },
          appCapabilities: { availableDisplayModes: ["inline"] },
          protocolVersion: "2026-01-26",
        },
      },
    ]);
    expect(card.el("card").getAttribute("aria-busy")).toBeNull();
  });

  it("finishes the handshake, applies the host's theme and variables, then reports its size", async () => {
    const card = loadCard();
    card.fromHost({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2026-01-26",
        hostInfo: { name: "test-host", version: "1.0.0" },
        hostCapabilities: {},
        hostContext: {
          theme: "dark",
          styles: {
            variables: {
              "--color-text-primary": "#fafafa",
              color: "red",
              "--font-sans": 3,
            },
          },
        },
      },
    });
    await flush();
    expect(methods(card.sent)).toEqual([
      "ui/initialize",
      "ui/notifications/initialized",
      "ui/notifications/size-changed",
    ]);
    expect(card.sent[2]?.params).toEqual({ width: 400, height: 220 });
    expect(card.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(card.documentElement.style.colorScheme).toBe("dark");
    // Only CSS custom properties with string values are applied.
    expect([...card.documentElement.style.values]).toEqual([
      ["--color-text-primary", "#fafafa"],
    ]);

    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: "light" },
    });
    expect(card.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("ignores messages from anything but the host window", async () => {
    const card = loadCard();
    card.fromHost(
      { jsonrpc: "2.0", id: 1, result: { hostCapabilities: {} } },
      { postMessage() {} },
    );
    await flush();
    expect(methods(card.sent)).toEqual(["ui/initialize"]);
  });

  it("shows a generate_qr_code card and opens files and the editor through ui/open-link", async () => {
    const card = await connected();
    const result = generateResult();
    const data = result._meta[CARD_KEY];
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: result,
    });
    expect(card.el("card").getAttribute("aria-busy")).toBe("false");
    expect(card.el("image").getAttribute("src")).toBe(data.svg);
    expect(card.el("image").hidden).toBe(false);
    expect(card.el("image").alt).toBe(
      "QR code: URL · https://example.com/menu",
    );
    expect(card.el("encodes").textContent).toBe(
      "URL · https://example.com/menu",
    );
    expect(card.el("details").textContent).toBe(
      "512 × 512 px · Error correction Q",
    );
    expect(card.el("actions").hidden).toBe(false);
    expect(card.el("png").textContent).toBe("Open PNG");
    expect(card.el("svg").textContent).toBe("Open SVG");
    expect(card.el("editor").hidden).toBe(false);

    card.el("png").fire("click");
    expect(card.sent.at(-1)).toMatchObject({
      method: "ui/open-link",
      params: { url: data.png },
    });
    card.el("editor").fire("click");
    expect(card.sent.at(-1)).toMatchObject({
      method: "ui/open-link",
      params: { url: data.editor },
    });
  });

  it("falls back to the result's PNG when the image API image doesn't load", async () => {
    const card = await connected();
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: generateResult(),
    });
    card.el("image").fire("error");
    expect(card.el("image").getAttribute("src")).toBe(
      `data:image/png;base64,${PNG}`,
    );
    card.el("image").fire("error");
    expect(card.el("frame").hidden).toBe(true);
    expect(card.el("status").textContent).toBe("The image didn't load.");
  });

  it("saves design_qr's PNG and SVG with ui/download-file when the host can", async () => {
    const card = await connected({ downloadFile: {}, openLinks: {} });
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: designResult(),
    });
    expect(card.el("image").getAttribute("src")).toBe(
      `data:image/png;base64,${PNG}`,
    );
    expect(card.el("encodes").textContent).toBe("WiFi · Cafe Guest");
    expect(card.el("png").textContent).toBe("Download PNG");
    expect(card.el("svg").textContent).toBe("Download SVG");

    card.el("png").fire("click");
    const png = card.sent.at(-1) as Message;
    expect(png).toMatchObject({
      method: "ui/download-file",
      params: {
        contents: [
          {
            type: "resource",
            resource: {
              uri: "file:///qr-code.png",
              mimeType: "image/png",
              blob: PNG,
            },
          },
        ],
      },
    });
    card.el("svg").fire("click");
    expect(card.sent.at(-1)).toMatchObject({
      method: "ui/download-file",
      params: {
        contents: [
          {
            type: "resource",
            resource: {
              uri: "file:///qr-code.svg",
              mimeType: "image/svg+xml",
              text: SVG,
            },
          },
        ],
      },
    });

    // design_qr has no image URL to fall back to, so a refusal says so.
    card.fromHost({
      jsonrpc: "2.0",
      id: png.id,
      error: { code: -32000, message: "Download denied by user" },
    });
    await flush();
    expect(card.el("status").textContent).toBe("The file wasn't saved.");
  });

  it("hides design_qr's file buttons when the host can't save files", async () => {
    const card = await connected({ openLinks: {} });
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: designResult(),
    });
    expect(card.el("png").hidden).toBe(true);
    expect(card.el("svg").hidden).toBe(true);
    expect(card.el("editor").hidden).toBe(false);
    expect(card.el("actions").hidden).toBe(false);
  });

  it("opens the image when a host that declared downloadFile doesn't have the method", async () => {
    const card = await connected({ downloadFile: {}, openLinks: {} });
    const result = generateResult();
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: result,
    });
    expect(card.el("png").textContent).toBe("Download PNG");
    // No SVG markup in the result: the SVG button opens the image URL.
    expect(card.el("svg").textContent).toBe("Open SVG");
    card.el("png").fire("click");
    const download = card.sent.at(-1) as Message;
    expect(download.method).toBe("ui/download-file");
    card.fromHost({
      jsonrpc: "2.0",
      id: download.id,
      error: { code: -32601, message: "Method not found" },
    });
    await flush();
    expect(card.sent.at(-1)).toMatchObject({
      method: "ui/open-link",
      params: { url: result._meta[CARD_KEY].png },
    });
  });

  it("uses ChatGPT's openExternal when the host doesn't declare openLinks", async () => {
    const openExternal = vi.fn();
    const card = await connected({}, { openai: { openExternal } });
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: generateResult(),
    });
    const before = card.sent.length;
    card.el("editor").fire("click");
    expect(openExternal).toHaveBeenCalledWith({
      href: "https://qrdx.dev/playground?style=1.abc",
    });
    expect(card.sent.slice(before)).toEqual([]);
  });

  it("never shows or opens addresses that aren't web addresses", async () => {
    const card = await connected();
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: generateResult({
        svg: "javascript:alert(1)",
        png: "data:text/html,hi",
        editor: "javascript:alert(1)",
      }),
    });
    expect(card.el("image").getAttribute("src")).toBe(
      `data:image/png;base64,${PNG}`,
    );
    expect(card.el("png").hidden).toBe(true);
    expect(card.el("svg").hidden).toBe(true);
    expect(card.el("editor").hidden).toBe(true);
    expect(card.el("actions").hidden).toBe(true);
  });

  it("shows a tool error as text, with no code or buttons", async () => {
    const card = await connected();
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        isError: true,
        content: [
          { type: "text", text: "The data is too long for a QR code." },
        ],
      },
    });
    expect(card.el("encodes").textContent).toBe(
      "The data is too long for a QR code.",
    );
    expect(card.el("frame").hidden).toBe(true);
    expect(card.el("actions").hidden).toBe(true);
  });

  it("says when the tool call was cancelled", async () => {
    const card = await connected();
    card.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-cancelled",
      params: { reason: "user" },
    });
    expect(card.el("encodes").textContent).toBe("Cancelled.");
    expect(card.el("frame").hidden).toBe(true);
  });

  it("answers ping and teardown, and refuses other host requests", async () => {
    const card = await connected();
    const before = card.sent.length;
    card.fromHost({ jsonrpc: "2.0", id: 7, method: "ping" });
    card.fromHost({
      jsonrpc: "2.0",
      id: 8,
      method: "ui/resource-teardown",
      params: { reason: "closed" },
    });
    card.fromHost({ jsonrpc: "2.0", id: 9, method: "tools/call", params: {} });
    card.fromHost({ jsonrpc: "2.0", method: "ui/notifications/unknown" });
    expect(card.sent.slice(before)).toEqual([
      { jsonrpc: "2.0", id: 7, result: {} },
      { jsonrpc: "2.0", id: 8, result: {} },
      {
        jsonrpc: "2.0",
        id: 9,
        error: { code: -32601, message: "Method not found" },
      },
    ]);
  });

  it("says so when the host never completes the handshake", async () => {
    const card = loadCard();
    card.fromHost({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "nope" },
    });
    await flush();
    expect(methods(card.sent)).toEqual(["ui/initialize"]);
    expect(card.el("encodes").textContent).toBe(
      "This card couldn't connect to the app.",
    );
  });
});
