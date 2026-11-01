// Which MCP server URL the connect page, snippets and install links show: the
// public https://mcp.qrdx.dev/mcp wherever QRdx itself runs (production,
// Vercel previews, local dev), and "<origin>/api/mcp" only on a self-hosted
// copy with its own domain.
import { describe, expect, it } from "vitest";
import {
  claudeConnectorUrl,
  MCP_PUBLIC_URL,
  mcpLocalUrl,
  mcpServerUrl,
} from "@/lib/mcp-clients";

const selfHosted = { appUrl: "https://qr.example.com" };

describe("mcpServerUrl", () => {
  it.each([
    "https://qrdx.dev",
    "https://www.qrdx.dev",
    "https://mcp.qrdx.dev",
    new URL("https://qrdx.dev/mcp"),
  ])("uses the public server on %s", (origin) => {
    expect(mcpServerUrl(origin, selfHosted)).toBe(MCP_PUBLIC_URL);
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "http://qrdx.localhost:3000",
  ])("uses the public server in local dev (%s)", (origin) => {
    expect(mcpServerUrl(origin, selfHosted)).toBe(MCP_PUBLIC_URL);
  });

  it("uses the public server on a Vercel preview of this project", () => {
    const origin = "https://qrdx-git-staging-team.vercel.app";
    expect(mcpServerUrl(origin, { productionUrl: "qrdx.dev" })).toBe(
      MCP_PUBLIC_URL,
    );
    expect(mcpServerUrl(origin, { appUrl: "https://qrdx.dev" })).toBe(
      MCP_PUBLIC_URL,
    );
  });

  it("uses the public server when the app URL is local", () => {
    expect(
      mcpServerUrl("https://qr.example.com", {
        appUrl: "http://localhost:3000",
      }),
    ).toBe(MCP_PUBLIC_URL);
  });

  it("uses a self-hosted copy's own endpoint", () => {
    expect(mcpServerUrl("https://qr.example.com", selfHosted)).toBe(
      "https://qr.example.com/api/mcp",
    );
    expect(
      mcpServerUrl("https://qr.example.com/some/page", {
        ...selfHosted,
        productionUrl: "qr.example.com",
      }),
    ).toBe("https://qr.example.com/api/mcp");
  });

  it("doesn't mistake look-alike domains for qrdx.dev", () => {
    expect(
      mcpServerUrl("https://notqrdx.dev", { appUrl: "https://notqrdx.dev" }),
    ).toBe("https://notqrdx.dev/api/mcp");
    expect(
      mcpServerUrl("https://qrdx.dev.example.com", {
        appUrl: "https://qrdx.dev.example.com",
      }),
    ).toBe("https://qrdx.dev.example.com/api/mcp");
  });

  it("prefills Claude with the public URL in local dev", () => {
    const link = new URL(
      claudeConnectorUrl(mcpServerUrl("http://localhost:3000", selfHosted)),
    );
    expect(link.searchParams.get("connectorUrl")).toBe(MCP_PUBLIC_URL);
  });
});

describe("mcpLocalUrl", () => {
  it("offers this instance's endpoint locally", () => {
    expect(mcpLocalUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/api/mcp",
    );
    expect(mcpLocalUrl(new URL("http://127.0.0.1:4000/mcp"))).toBe(
      "http://127.0.0.1:4000/api/mcp",
    );
  });

  it("is null anywhere else", () => {
    expect(mcpLocalUrl("https://qrdx.dev")).toBeNull();
    expect(mcpLocalUrl("https://qr.example.com")).toBeNull();
  });
});
