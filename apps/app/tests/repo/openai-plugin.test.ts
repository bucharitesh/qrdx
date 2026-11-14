// plugins/agent/plugin.json carries the OpenAI plugin directory's listing and
// review cases under extensions.com.openai (the ZIP uploaded to OpenAI is
// that folder). This keeps them inside the portal's limits and keeps the
// review cases pointed at tools the MCP server really has.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOLS } from "@/app/[lang]/(home)/mcp/content";

const PLUGIN = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "plugins",
  "agent",
);
const manifest = JSON.parse(readFileSync(join(PLUGIN, "plugin.json"), "utf8"));
const openai = manifest.extensions["com.openai"];
const { interface: listing, review } = openai;

describe("plugins/agent OpenAI listing", () => {
  it("fits the portal's field limits", () => {
    expect(listing.displayName.length).toBeLessThanOrEqual(30);
    expect(listing.shortDescription.length).toBeLessThanOrEqual(30);
    expect(listing.longDescription.length).toBeLessThanOrEqual(4000);
    expect(listing.developerName.length).toBeLessThanOrEqual(80);
    expect(listing.capabilities.length).toBeLessThanOrEqual(20);
    for (const label of listing.capabilities) {
      expect(label.length).toBeLessThanOrEqual(120);
    }
    expect(listing.defaultPrompt.length).toBeLessThanOrEqual(3);
    expect(new Set(listing.defaultPrompt).size).toBe(
      listing.defaultPrompt.length,
    );
    for (const prompt of listing.defaultPrompt) {
      expect(prompt.length).toBeLessThanOrEqual(128);
    }
  });

  it("links the four pages MCP review asks for over HTTPS", () => {
    for (const key of [
      "websiteURL",
      "supportURL",
      "privacyPolicyURL",
      "termsOfServiceURL",
    ]) {
      expect(listing[key]).toMatch(/^https:\/\//);
    }
  });

  it("ships every icon it names", () => {
    for (const key of ["composerIcon", "logo"]) {
      expect(listing[key]).toMatch(/^\.\/assets\//);
      expect(existsSync(join(PLUGIN, listing[key]))).toBe(true);
    }
  });

  it("has the five positive and three negative cases initial review needs", () => {
    const { positive, negative } = review.test_cases;
    expect(positive).toHaveLength(5);
    expect(negative).toHaveLength(3);
    for (const testCase of positive) {
      for (const key of [
        "description",
        "prompt",
        "tools_triggered",
        "expected_behavior",
      ]) {
        expect(testCase[key]).toEqual(expect.any(String));
      }
    }
    for (const testCase of negative) {
      expect(Object.keys(testCase).sort()).toEqual(["description", "prompt"]);
    }
  });

  it("only names tools that work without an API key", () => {
    const keyless = new Set(
      MCP_TOOLS.filter((tool) => !tool.needsKey).map((tool) => tool.name),
    );
    for (const testCase of review.test_cases.positive) {
      for (const tool of testCase.tools_triggered
        .split(",")
        .map((name: string) => name.trim())) {
        expect(keyless).toContain(tool);
      }
    }
  });

  it("keeps reviewer access out of the package", () => {
    expect(review).not.toHaveProperty("test_credentials");
    expect(review).not.toHaveProperty("reviewer_instructions");
  });
});
