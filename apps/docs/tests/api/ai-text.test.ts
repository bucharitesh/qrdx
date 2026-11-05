// The text AI routes end to end against a fake Vercel AI Gateway behind fetch
// (tests/support/fake-gateway.ts): the app's real gateway client builds each
// request, so these check which model each task asks for and that a
// provider's options reach only that provider. Usage bookkeeping is mocked;
// nothing touches a database or the network.
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type GatewayCall, installFakeGateway } from "../support/fake-gateway";

const usage = vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  return {
    reserved: [] as string[],
    finalized: [] as string[],
    released: [] as string[],
  };
});

vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "u_alice" },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/subscription", () => ({
  reserveAIRequest: async (_userId: string, modelId: string) => {
    usage.reserved.push(modelId);
    return `usage_${usage.reserved.length}`;
  },
  finalizeAIRequest: async (id: string) => {
    usage.finalized.push(id);
  },
  releaseAIRequest: async (id: string) => {
    usage.released.push(id);
  },
}));

const enhance = await import("@/app/api/enhance-prompt/route");
const theme = await import("@/app/api/generate-qr-theme/route");

const gateway = installFakeGateway();
afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  gateway.reset();
  usage.reserved.length = 0;
  usage.finalized.length = 0;
  usage.released.length = 0;
});

const USAGE = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
};

/** A streamed model reply (LanguageModelV4 stream parts as server-sent events). */
function stream(parts: Record<string, unknown>[]): Response {
  const body = parts
    .map((part) => `data: ${JSON.stringify(part)}\n\n`)
    .join("");
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

const textReply = (text: string) =>
  stream([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "end_turn" },
      usage: USAGE,
    },
  ]);

const modelOf = (call: GatewayCall) => call.headers["ai-language-model-id"];

/** The text a UI message stream carries, its deltas joined. */
async function streamedText(response: Response): Promise<string> {
  return (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)))
    .filter((event) => event.type === "text-delta")
    .map((event) => event.delta)
    .join("");
}

const post = (
  handler: (req: NextRequest) => Promise<Response>,
  path: string,
  body: unknown,
) =>
  handler(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/enhance-prompt", () => {
  it("asks Claude Haiku 5.5 through Anthropic only, with no Google options", async () => {
    gateway.respondWith(() => textReply("A neon koi pond at night"));
    const response = await post(enhance.POST, "/api/enhance-prompt", {
      promptData: { content: "koi", mentions: [] },
    });
    expect(response.status).toBe(200);
    expect(await streamedText(response)).toBe("A neon koi pond at night");

    expect(gateway.calls).toHaveLength(1);
    const [call] = gateway.calls;
    expect(call?.url).toBe("https://ai-gateway.vercel.sh/v4/ai/language-model");
    expect(modelOf(call!)).toBe("anthropic/claude-haiku-5.5");
    expect(call?.headers.authorization).toBe("Bearer test-gateway-key");
    expect(call?.body.providerOptions).toEqual({
      gateway: { disallowPromptTraining: true, only: ["anthropic"] },
    });
    expect(usage.reserved).toEqual(["anthropic/claude-haiku-5.5"]);
    expect(usage.finalized).toEqual(["usage_1"]);
    expect(usage.released).toEqual([]);
  });
});

describe("POST /api/generate-qr-theme", () => {
  // A complete style from the designer (lib/qr-design/style.ts).
  const generatedTheme = {
    bgColor: "#FFFFFF",
    fgColor: "#111111",
    eyeColor: "#1D4ED8",
    dotColor: "#B91C1C",
    bodyPattern: "circle",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "circle",
    margin: 4,
    level: "Q",
    frame: { style: "none" },
    templateId: "default",
    logo: "none",
  };

  it("chats on Claude, designs the code on Gemini 3 Flash, each with its own options", async () => {
    let baseCalls = 0;
    gateway.respondWith((call) => {
      if (modelOf(call) === "google/gemini-3-flash") {
        const json = JSON.stringify(generatedTheme);
        return stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "j1" },
          { type: "text-delta", id: "j1", delta: json.slice(0, 40) },
          { type: "text-delta", id: "j1", delta: json.slice(40) },
          { type: "text-end", id: "j1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "STOP" },
            usage: USAGE,
          },
        ]);
      }
      baseCalls++;
      if (baseCalls === 1) {
        return stream([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "design_qr",
            input: JSON.stringify({
              brief: "Crisp blue and red",
              start_from: "new",
            }),
          },
          {
            type: "finish",
            finishReason: { unified: "tool-calls", raw: "tool_use" },
            usage: USAGE,
          },
        ]);
      }
      return textReply("Here's a crisp blue and red theme.");
    });

    const response = await post(theme.POST, "/api/generate-qr-theme", {
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "blue and red" }],
          metadata: { promptData: { content: "blue and red", mentions: [] } },
        },
      ],
    });
    expect(response.status).toBe(200);
    const events = await response.text();
    expect(events).toContain('"type":"tool-output-available"');
    expect(events).toContain('"grade":"great"');
    expect(events).toContain("Here's a crisp blue and red theme.");

    const models = gateway.calls.map(modelOf);
    expect(models).toEqual([
      "anthropic/claude-haiku-5.5",
      "google/gemini-3-flash",
      "anthropic/claude-haiku-5.5",
    ]);
    const [chat, design] = gateway.calls;
    expect(chat?.body.providerOptions).toEqual({
      gateway: { disallowPromptTraining: true, only: ["anthropic"] },
    });
    expect(chat?.body.tools.map((tool: { name: string }) => tool.name)).toEqual(
      [
        "design_qr",
        "check_scan_score",
        "ask_user",
        "apply_design",
        "save_template",
        "use_image",
        "request_content",
      ],
    );
    expect(design?.body.providerOptions).toEqual({
      gateway: { disallowPromptTraining: true, only: ["google", "vertex"] },
      google: {
        thinkingConfig: { includeThoughts: false, thinkingBudget: 128 },
      },
    });
    expect(design?.body.responseFormat).toMatchObject({ type: "json" });
    expect(usage.reserved).toEqual(["anthropic/claude-haiku-5.5"]);
    expect(usage.released).toEqual([]);
  });

  it("refunds the request when the gateway rejects the key", async () => {
    gateway.respondWith(() =>
      Response.json(
        {
          error: {
            message: "Authentication failed.",
            type: "authentication_error",
          },
        },
        { status: 401 },
      ),
    );
    const response = await post(theme.POST, "/api/generate-qr-theme", {
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "green" }],
          metadata: { promptData: { content: "green", mentions: [] } },
        },
      ],
    });
    // The stream reports the error to the client; the credit is refunded.
    await response.text();
    expect(usage.released).toEqual(["usage_1"]);
  });
});
