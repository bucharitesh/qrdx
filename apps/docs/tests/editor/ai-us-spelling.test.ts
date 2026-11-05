// The AI chat (the Generate tab) writes in US spelling, like the rest of
// the site. The model mirrors the words it is given, so its prompts, its
// tools' descriptions and input schemas, and the chat's own messages are
// checked for UK spellings ("Make the dots a different colour", "Your
// flower as the centre logo" were seen live). Only prose is checked:
// identifiers such as the `eyeCentres` schema key are the tools' contract.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as agentPrompts from "@/lib/ai/agent/prompts";
import { QR_AGENT_TOOLS } from "@/lib/ai/agent/tools";
import * as chatPrompts from "@/lib/ai/prompts";
import { sourceCode, sourceFiles, ukWords } from "../support/us-spelling";

describe("what the model is told", () => {
  it("prompts use US spelling", () => {
    const prompts = { ...agentPrompts, ...chatPrompts } as Record<
      string,
      unknown
    >;
    const found = Object.entries(prompts).flatMap(([name, value]) =>
      typeof value === "string"
        ? ukWords(value).map((word) => `${name}: ${word}`)
        : [],
    );
    expect(found).toEqual([]);
  });

  it("tool descriptions and input schemas use US spelling", () => {
    const found = Object.entries(QR_AGENT_TOOLS).flatMap(([name, tool]) => {
      const { description, inputSchema } = tool as unknown as {
        description?: string;
        inputSchema?: z.ZodType;
      };
      const schema = inputSchema
        ? JSON.stringify(z.toJSONSchema(inputSchema, { io: "input" }))
        : "";
      return ukWords(`${description ?? ""} ${schema}`).map(
        (word) => `${name}: ${word}`,
      );
    });
    expect(found).toEqual([]);
  });
});

describe("what the chat shows", () => {
  it("strings in the chat and its tools use US spelling", () => {
    const root = process.cwd();
    const paths = [
      ...sourceFiles(join(root, "lib/ai/agent")),
      ...sourceFiles(join(root, "components/editor/ai")),
      // The agent's design tool: its schema, repairs and change notes
      join(root, "lib/qr-design/style.ts"),
      join(root, "lib/qr-design/repair.ts"),
    ];
    const found = paths.flatMap((path) =>
      ukWords(sourceCode(path)).map(
        (word) => `${path.slice(root.length + 1)}: ${word}`,
      ),
    );
    expect(found).toEqual([]);
  });
});
