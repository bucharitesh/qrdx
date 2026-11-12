// server.json at the repo root is what the owner publishes to the official
// MCP Registry (mcp-publisher). It must describe the server that runs: the
// version initialize reports, the public URL, the tools that need a key, and
// every barcode format generate_barcode draws.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOLS } from "@/app/[lang]/(home)/mcp/content";
import { MCP_SERVER_INFO } from "@/app/api/mcp/tools";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import { MCP_PUBLIC_URL } from "@/lib/mcp-clients";

const server = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../server.json"), "utf8"),
);
const summary: string =
  server._meta["io.modelcontextprotocol.registry/publisher-provided"].summary;

describe("server.json", () => {
  it("names the registry entry and the running server's version", () => {
    expect(server.name).toBe("io.github.bucharitesh/qrdx");
    expect(server.version).toBe(MCP_SERVER_INFO.version);
    expect(server.$schema).toMatch(
      /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/\d{4}-\d{2}-\d{2}\/server\.schema\.json$/,
    );
  });

  it("keeps the description within the registry's 100 characters", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.description).toMatch(/QR codes and barcodes/);
  });

  it("points at the public endpoint with an optional key header", () => {
    expect(server.remotes).toEqual([
      expect.objectContaining({ type: "streamable-http", url: MCP_PUBLIC_URL }),
    ]);
    const [header] = server.remotes[0].headers;
    expect(header).toMatchObject({
      name: "Authorization",
      isRequired: false,
      isSecret: true,
    });
    // Only the save tools need it.
    expect(
      MCP_TOOLS.filter((tool) => tool.needsKey).map((t) => t.name),
    ).toEqual(["save_template", "save_barcode"]);
  });

  it("lists every barcode format the server draws", () => {
    for (const format of BARCODE_FORMATS) {
      expect(summary, format.label).toContain(format.label);
    }
  });
});
