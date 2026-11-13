// What API and MCP clients read is in US spelling, like the rest of the
// site: the MCP server's instructions, tool descriptions and input schemas,
// the OpenAPI document (packages/docs-assets/openapi.json, generated from
// lib/openapi and the route schemas) and the REST routes' own messages. Descriptions only:
// field names and other identifiers are the APIs' contract.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sourceCode, sourceFiles, ukWords } from "../support/us-spelling";

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

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await route.POST(
    new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await response.text();
  return response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
}

const root = process.cwd();

describe("what API and MCP clients read", () => {
  it("the MCP server's instructions and tools use US spelling", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    const tools = await rpc("tools/list");
    expect(tools).toContain("generate_qr_code");
    expect(ukWords(`${init}\n${tools}`)).toEqual([]);
  });

  it("the OpenAPI document uses US spelling", () => {
    const document = readFileSync(
      join(root, "../../packages/docs-assets/openapi.json"),
      "utf8",
    );
    expect(ukWords(document)).toEqual([]);
  });

  // Error messages are part of the REST API's responses (clients and
  // tests/api/image-api.test.ts match on them), so they keep their wording
  // until the API's errors change on purpose. Descriptions don't.
  const RESPONSE_MESSAGES = [
    "Must be a hex colour (#155dfc), rgb()/hsl() or a colour name",
    "Must be a colour (hex, rgb()/hsl() or a colour name)",
  ];

  it("strings in the MCP and REST code use US spelling", () => {
    const paths = [
      ...sourceFiles(join(root, "app/api/mcp")),
      ...sourceFiles(join(root, "app/api/v1")),
      ...sourceFiles(join(root, "lib/openapi")),
      ...sourceFiles(join(root, "lib/qr-api")),
      join(root, "lib/qr-render.ts"),
    ];
    const found = paths.flatMap((path) =>
      ukWords(
        RESPONSE_MESSAGES.reduce(
          (code, message) => code.replaceAll(message, ""),
          sourceCode(path),
        ),
      ).map((word) => `${path.slice(root.length + 1)}: ${word}`),
    );
    expect(found).toEqual([]);
  });
});
