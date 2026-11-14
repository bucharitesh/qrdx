// plugins/agent is the QRdx plugin for Claude Code, Copilot CLI, Cursor and
// Codex (listed by .claude-plugin/marketplace.json for Claude Code and by
// .cursor-plugin/marketplace.json for Cursor), and gemini-extension.json
// at the root is the Gemini CLI extension. The plugin carries a real copy of
// skills/generate-qr, because directories refuse symlinks; this keeps the
// copy, the manifests and the MCP server URL in step.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_PUBLIC_URL } from "@/lib/mcp-clients";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const PLUGIN = join(REPO, "plugins", "agent");

function readJson(...path: string[]) {
  return JSON.parse(readFileSync(join(...path), "utf8"));
}

const agentPlugin = readJson(PLUGIN, "plugin.json");
const claudePlugin = readJson(PLUGIN, ".claude-plugin", "plugin.json");
const gemini = readJson(REPO, "gemini-extension.json");
const cursorMarketplace = readJson(REPO, ".cursor-plugin", "marketplace.json");

describe("plugins/agent", () => {
  it("carries an exact copy of skills/generate-qr", () => {
    const out = execFileSync(
      process.execPath,
      [join(REPO, "scripts", "sync-agent-plugin.mjs"), "--check"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(out).toContain("matches skills/generate-qr");
  });

  it("names the same plugin and version in every manifest", () => {
    for (const manifest of [agentPlugin, claudePlugin, gemini]) {
      expect(manifest.name).toBe("qrdx");
      expect(manifest.version).toBe(agentPlugin.version);
    }
    expect(agentPlugin.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    expect(agentPlugin.license).toBe("MIT");
    expect(claudePlugin.license).toBe("MIT");
    expect(cursorMarketplace.plugins[0].version).toBe(agentPlugin.version);
  });

  it("connects the public MCP server with no headers", () => {
    expect(readJson(PLUGIN, "mcp.json").mcpServers).toEqual({
      qrdx: { type: "streamable-http", url: MCP_PUBLIC_URL },
    });
    expect(readJson(PLUGIN, ".mcp.json").mcpServers).toEqual({
      qrdx: { type: "http", url: MCP_PUBLIC_URL },
    });
    expect(gemini.mcpServers).toEqual({
      qrdx: { type: "http", url: MCP_PUBLIC_URL },
    });
  });

  it("is listed by the marketplace at the repository root", () => {
    const marketplace = readJson(REPO, ".claude-plugin", "marketplace.json");
    expect(marketplace.name).toBe("qrdx");
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: "qrdx", source: "./plugins/agent" }),
    ]);
  });

  it("is listed for Cursor, with a logo that exists", () => {
    expect(cursorMarketplace.name).toBe("qrdx");
    expect(cursorMarketplace.plugins).toEqual([
      expect.objectContaining({
        name: "qrdx",
        source: "plugins/agent",
        logo: "assets/logo.png",
      }),
    ]);
    expect(() =>
      readFileSync(join(PLUGIN, cursorMarketplace.plugins[0].logo)),
    ).not.toThrow();
  });

  it("states the CLI version the skill pins", () => {
    const skill = readFileSync(
      join(PLUGIN, "skills", "generate-qr", "SKILL.md"),
      "utf8",
    );
    const pin = skill.match(/npx @qrdx\/cli@(\d+\.\d+\.\d+)/)?.[1];
    expect(pin).toBeDefined();
    expect(readFileSync(join(PLUGIN, "README.md"), "utf8")).toContain(
      `npx @qrdx/cli@${pin}`,
    );
  });
});
