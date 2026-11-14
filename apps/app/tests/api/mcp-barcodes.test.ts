// The MCP server's barcode tools (app/api/mcp/barcodes.ts), as
// apps/docs/content/docs/developers/mcp.mdx describes them: generate_barcode checks
// the value like the image API and returns a PNG that decodes plus public
// image URLs, with no key; save_barcode saves to the API key's workspace and
// is a clear 401 without one. Saved rows live in in-memory tables.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const KEY = `qrdx_${"a".repeat(40)}`;

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
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
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "free",
}));
vi.mock("@/ee/audit-log/record", () => ({ recordAuditEvent: () => {} }));
vi.mock("@/lib/api-keys/service", () => ({
  authenticateApiKey: async (token: string) =>
    token === KEY
      ? {
          keyId: "key_1",
          name: "Agent",
          userId: "u_alice",
          organizationId: ownWorkspaceId("u_alice"),
          role: "owner",
          scopes: ["codes:read", "codes:write"],
        }
      : null,
}));

(globalThis as { DOMRectReadOnly?: unknown }).DOMRectReadOnly ??= class {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
};

const route = await import("@/app/api/mcp/route");

let detector: BarcodeDetector;
beforeAll(() => {
  const require = createRequire(import.meta.url);
  const from = createRequire(require.resolve("barcode-detector/ponyfill"));
  const wasm = readFileSync(
    from.resolve("zxing-wasm/reader/zxing_reader.wasm"),
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
  detector = new BarcodeDetector({ formats: ["ean_13", "data_matrix"] });
});

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("organization", [
    {
      id: ownWorkspaceId("u_alice"),
      name: "Alice",
      slug: "alice",
      createdAt: new Date(0),
    },
  ]);
  fakeDb.defaults("barcode", () => ({
    folderId: null,
    title: null,
    options: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
});

let rpcId = 0;
async function call(name: string, args: Record<string, unknown>, key?: string) {
  const response = await route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
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
  return JSON.parse(json).result as {
    isError?: boolean;
    content: { type: string; text?: string; data?: string }[];
  };
}

describe("generate_barcode", () => {
  it("adds the check digit and returns a PNG that decodes, with image URLs", async () => {
    const result = await call("generate_barcode", {
      format: "EAN-13",
      data: "590123412345",
    });
    expect(result.isError).toBeUndefined();
    const summary = result.content[0]?.text ?? "";
    expect(summary).toContain("EAN-13 barcode for 5901234123457");
    expect(summary).toContain("Check digit 7 added.");
    expect(summary).toContain(
      "SVG URL: http://localhost:3000/api/v1/barcode?format=ean13&data=5901234123457",
    );
    expect(summary).toContain("&type=pdf");
    const png = result.content.find((part) => part.type === "image")?.data;
    const found = await detector.detect(
      new Blob([Buffer.from(png ?? "", "base64")], { type: "image/png" }),
    );
    expect(found.map((code) => code.rawValue)).toEqual(["5901234123457"]);
  });

  it("says what's wrong with a value", async () => {
    const result = await call("generate_barcode", {
      format: "ean13",
      data: "5901234123458",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(
      /data: EAN-13: The check digit should be 7, not 8/,
    );
  });

  it("returns the SVG on request", async () => {
    const result = await call("generate_barcode", {
      format: "datamatrix",
      data: "SN-42",
      include_svg: true,
    });
    expect(result.content.at(-1)?.text).toMatch(/^<svg /);
  });
});

describe("save_barcode", () => {
  it("needs an API key", async () => {
    const result = await call("save_barcode", {
      format: "ean13",
      value: "590123412345",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/needs a QRdx API key/);
    expect(fakeDb.rows("barcode")).toHaveLength(0);
  });

  it("saves to the key's workspace and links to it", async () => {
    const result = await call(
      "save_barcode",
      { format: "ean13", value: "590123412345", title: "Spring box" },
      KEY,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(
      /^Saved "Spring box" to the workspace's Barcodes\. Open it: http:\/\/localhost:3000\/dashboard\/alice\/barcodes\//,
    );
    expect(fakeDb.rows("barcode")).toEqual([
      expect.objectContaining({
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        format: "ean13",
        value: "5901234123457",
        title: "Spring box",
      }),
    ]);
  });
});
