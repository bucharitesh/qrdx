// The AI chat agent end to end (/api/generate-qr-theme) against a fake
// Vercel AI Gateway behind fetch (tests/support/fake-gateway.ts): the chat
// model and the designer model are scripted, while the tools, the
// score-and-repair loop (real engine rendering and decoding), tool approval
// and the resume tokens all run for real. The chat history between requests
// is rebuilt from the UI message stream, as useChat does, and approvals and
// answers are added the way useChat adds them. Usage bookkeeping and the
// template store are fakes: nothing touches a database or the network.
import { readUIMessageStream, type UIMessageChunk } from "ai";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types/ai";
import { type GatewayCall, installFakeGateway } from "../support/fake-gateway";

const state = vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  return {
    reserved: [] as string[],
    finalized: [] as string[],
    released: [] as string[],
    saved: [] as { userId: string; name: string; style: unknown }[],
    quotaAllowed: true,
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
    state.reserved.push(modelId);
    return `usage_${state.reserved.length}`;
  },
  finalizeAIRequest: async (id: string) => {
    state.finalized.push(id);
  },
  releaseAIRequest: async (id: string) => {
    state.released.push(id);
  },
}));
vi.mock("@/lib/ai/agent/templates", () => ({
  TEMPLATE_NAME_MAX_LENGTH: 50,
  accountTemplateStore: {
    quota: async () =>
      state.quotaAllowed
        ? { allowed: true }
        : {
            allowed: false,
            message:
              "You have reached the limit of 10 saved themes on the Free plan. Upgrade to Pro for unlimited themes.",
          },
    save: async (
      userId: string,
      template: { name: string; style: unknown },
    ) => {
      state.saved.push({ userId, ...template });
      return { ok: true, id: "theme_1", name: template.name };
    },
  },
}));

const route = await import("@/app/api/generate-qr-theme/route");
const gateway = installFakeGateway();
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  gateway.reset();
  state.reserved.length = 0;
  state.finalized.length = 0;
  state.released.length = 0;
  state.saved.length = 0;
  state.quotaAllowed = true;
});

const USAGE = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
};

/** A streamed model reply (LanguageModelV4 stream parts as server-sent events). */
function stream(parts: Record<string, unknown>[]): Response {
  const body = [
    { type: "stream-start", warnings: [] },
    ...parts,
    {
      type: "finish",
      finishReason: parts.some((part) => part.type === "tool-call")
        ? { unified: "tool-calls", raw: "tool_use" }
        : { unified: "stop", raw: "end_turn" },
      usage: USAGE,
    },
  ]
    .map((part) => `data: ${JSON.stringify(part)}\n\n`)
    .join("");
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

const text = (id: string, value: string) => [
  { type: "text-start", id },
  { type: "text-delta", id, delta: value },
  { type: "text-end", id },
];
const toolCall = (toolCallId: string, toolName: string, input: unknown) => ({
  type: "tool-call",
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});
const json = (value: unknown) => stream(text("j", JSON.stringify(value)));

const modelOf = (call: GatewayCall) => call.headers["ai-language-model-id"];
const isDesigner = (call: GatewayCall) =>
  modelOf(call) === "google/gemini-3-flash";
const promptText = (call: GatewayCall) => JSON.stringify(call.body.prompt);

/** A pale, risky first candidate: low-contrast dots, circle eyes, a logo at L. */
const RISKY = {
  bgColor: "#FFF7ED",
  fgColor: "#FDBA74",
  eyeColor: "#FB923C",
  dotColor: "#FB923C",
  bodyPattern: "circle",
  cornerEyePattern: "circle",
  cornerEyeDotPattern: "circle",
  margin: 4,
  level: "L",
  frame: { style: "banner-bottom", text: "Free Wi-Fi" },
  templateId: "default",
  logo: "wifi",
};
/** The designer's revision: the same look, darker, rounded eyes, level H. */
const REVISED = {
  ...RISKY,
  fgColor: "#9A3412",
  eyeColor: "#7C2D12",
  dotColor: "#7C2D12",
  cornerEyePattern: "rounded",
  level: "H",
};

const WIFI_CONTENT = {
  type: "wifi",
  ssid: "Cafe Guest",
  password: "sunshine123",
  encryption: "WPA",
};

const userMessage = (content: string): ChatMessage => ({
  id: `user-${content.length}`,
  role: "user",
  parts: [{ type: "text", text: content }],
  metadata: { promptData: { content, mentions: [] } },
});

const EDITOR = {
  contentType: "url",
  content: { url: "https://example.com" },
  value: "https://example.com",
  style: {
    bgColor: "#ffffff",
    fgColor: "#000000",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
    level: "Q",
  },
};

async function post(messages: ChatMessage[], editor: unknown = EDITOR) {
  const response = await route.POST(
    new NextRequest("http://localhost/api/generate-qr-theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, editor }),
    }),
  );
  expect(response.status).toBe(200);
  const raw = await response.text();
  const chunks = raw
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)) as UIMessageChunk);
  return { chunks, raw };
}

/** The assistant message useChat builds from a response (continuing `last`). */
async function assistantFrom(
  chunks: UIMessageChunk[],
  last?: ChatMessage,
): Promise<ChatMessage> {
  let message: ChatMessage | undefined;
  for await (const snapshot of readUIMessageStream<ChatMessage>({
    message: last,
    stream: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  })) {
    message = snapshot;
  }
  if (!message) throw new Error("No assistant message in the stream");
  return message;
}

type ToolPart = Extract<ChatMessage["parts"][number], { toolCallId: string }>;
const toolPart = (message: ChatMessage, type: string) =>
  message.parts.find((part) => part.type === type) as ToolPart | undefined;

/** As useChat's addToolApprovalResponse does. */
function respondToApproval(
  message: ChatMessage,
  approved: boolean,
): ChatMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      "state" in part && part.state === "approval-requested"
        ? ({
            ...part,
            state: "approval-responded",
            approval: { ...part.approval, approved },
          } as ChatMessage["parts"][number])
        : part,
    ),
  };
}

/** As useChat's addToolOutput does for ask_user. */
function answer(message: ChatMessage, value: string): ChatMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      part.type === "tool-ask_user" && part.state === "input-available"
        ? ({
            ...part,
            state: "output-available",
            output: { answer: value },
          } as ChatMessage["parts"][number])
        : part,
    ),
  };
}

/** Scripts the chat model by turn; the designer answers with `designs` in order. */
function script(chat: Response[] | (() => Response), designs: unknown[] = []) {
  let turn = 0;
  let design = 0;
  gateway.respondWith((call) => {
    if (isDesigner(call)) return json(designs[design++] ?? designs.at(-1));
    if (typeof chat === "function") return chat();
    const reply = chat[turn++];
    if (!reply) throw new Error(`No scripted chat reply for turn ${turn}`);
    return reply;
  });
}

const PROMPT =
  "Make a Wi-Fi QR for Cafe Guest, password sunshine123, warm orange, with a frame";

async function designAndAskToApply() {
  script(
    [
      stream([
        toolCall("call_design", "design_qr", {
          brief: "Warm orange with a 'Free Wi-Fi' frame and a Wi-Fi logo",
          start_from: "new",
          content: WIFI_CONTENT,
        }),
      ]),
      stream([
        ...text("t1", "Scan score is Great after darkening the orange."),
        toolCall("call_apply", "apply_design", {
          design_id: "call_design",
          summary: "Wi-Fi code for Cafe Guest in warm orange",
          followups: ["Make it darker", "Save as a template"],
        }),
      ]),
    ],
    [RISKY, REVISED],
  );
  const user = userMessage(PROMPT);
  const first = await post([user]);
  const assistant = await assistantFrom(first.chunks);
  return { user, first, assistant };
}

describe("the QR agent", () => {
  it("designs a Wi-Fi code from a sentence, repairs it to Great and asks before applying", async () => {
    const { first, assistant } = await designAndAskToApply();

    // Chat on Claude, design and repair on Gemini.
    expect(gateway.calls.map(modelOf)).toEqual([
      "anthropic/claude-haiku-5.5",
      "google/gemini-3-flash",
      "google/gemini-3-flash",
      "anthropic/claude-haiku-5.5",
    ]);
    const revision = gateway.calls[2] as GatewayCall;
    expect(promptText(revision)).toContain("Failed checks");
    expect(promptText(revision)).toMatch(/Circle eyes|contrast/i);
    // The chat model only sees the editor's content type, not its values.
    const chat = gateway.calls[0] as GatewayCall;
    expect(JSON.stringify(chat.body)).not.toContain("example.com");
    expect(chat.body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "design_qr",
      "check_scan_score",
      "ask_user",
      "apply_design",
      "save_template",
    ]);

    const design = toolPart(assistant, "tool-design_qr");
    expect(design?.state).toBe("output-available");
    const output = design?.state === "output-available" ? design.output : null;
    expect(output).toMatchObject({
      ok: true,
      grade: "great",
      content: { summary: "WiFi · Cafe Guest" },
      value: "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
    });
    if (!output || !("score" in output)) throw new Error("no design");
    expect(output.score).toBeGreaterThanOrEqual(85);
    expect(output.attempts[0]?.grade).not.toBe("great");
    expect(output.attempts.map((attempt) => attempt.by)).toEqual([
      "initial",
      "model",
    ]);
    expect(output.repairs).toBe(1);
    expect(output.changes).toContain("Dots: #FDBA74 → #9A3412");
    // The Wi-Fi icon logo resolved to the editor's quick-icon data URL.
    expect(output.logo).toMatchObject({ showLogo: true });
    expect(typeof output.logo === "object" && output.logo.customLogo).toContain(
      encodeURIComponent('data-qrdx-icon="wifi"'),
    );

    // Applying waits for the user.
    const apply = toolPart(assistant, "tool-apply_design");
    expect(apply?.state).toBe("approval-requested");
    expect(
      first.chunks.some((chunk) => chunk.type === "tool-approval-request"),
    ).toBe(true);
    expect(assistant.metadata?.resume).toMatch(/^\d+\./);
    expect(state.reserved).toEqual(["anthropic/claude-haiku-5.5"]);
  });

  it("applies after approval, as the same AI request", async () => {
    const { user, assistant } = await designAndAskToApply();
    gateway.reset();
    script([stream(text("t2", "Applied. You can undo it from the chat."))]);

    const approved = respondToApproval(assistant, true);
    const second = await post([user, approved]);
    const after = await assistantFrom(second.chunks, approved);

    const apply = toolPart(after, "tool-apply_design");
    expect(apply?.state).toBe("output-available");
    const output = apply?.state === "output-available" ? apply.output : null;
    expect(output).toMatchObject({
      ok: true,
      designId: "call_design",
      grade: "great",
      content: {
        config: WIFI_CONTENT,
        summary: "WiFi · Cafe Guest",
      },
      themeStyles: {
        frame: { style: "banner-bottom", text: "Free Wi-Fi" },
        level: "H",
      },
      followups: ["Make it darker", "Save as a template"],
    });
    // Resuming didn't use another AI request.
    expect(state.reserved).toEqual(["anthropic/claude-haiku-5.5"]);
    // The chat model saw the approved result.
    expect(promptText(gateway.calls[0] as GatewayCall)).toContain(
      "apply_design",
    );
  });

  it("leaves the editor alone when the user rejects", async () => {
    const { user, assistant } = await designAndAskToApply();
    gateway.reset();
    script([stream(text("t2", "Okay, I left your code as it was."))]);

    const rejected = respondToApproval(assistant, false);
    const second = await post([user, rejected]);
    const after = await assistantFrom(second.chunks, rejected);

    expect(toolPart(after, "tool-apply_design")?.state).toBe("output-denied");
    expect(
      second.chunks.some((chunk) => chunk.type === "tool-output-available"),
    ).toBe(false);
    expect(promptText(gateway.calls[0] as GatewayCall)).toMatch(
      /execution-denied|denied/,
    );
  });

  it("counts a continuation without a valid resume token as a new request", async () => {
    const { user, assistant } = await designAndAskToApply();
    gateway.reset();
    script([stream(text("t2", "Applied."))]);

    const forged = respondToApproval(
      { ...assistant, metadata: { ...assistant.metadata, resume: "1.forged" } },
      true,
    );
    await post([user, forged]);
    expect(state.reserved).toHaveLength(2);
  });

  it("asks a question with options and resumes with the answer", async () => {
    script([
      stream([
        toolCall("call_ask", "ask_user", {
          question:
            "Is Office Guest an open network or does it have a password?",
          options: ["Open network", "It has a password"],
        }),
      ]),
      stream(text("t1", "Got it.")),
    ]);
    const user = userMessage("Wi-Fi QR for Office Guest");
    const first = await post([user]);
    const assistant = await assistantFrom(first.chunks);

    const ask = toolPart(assistant, "tool-ask_user");
    expect(ask?.state).toBe("input-available");
    expect(ask?.input).toMatchObject({
      options: ["Open network", "It has a password"],
    });
    expect(assistant.metadata?.resume).toBeTruthy();

    const answered = answer(assistant, "Open network");
    await post([user, answered]);
    expect(promptText(gateway.calls.at(-1) as GatewayCall)).toContain(
      "Open network",
    );
    expect(state.reserved).toHaveLength(1);
  });

  it("tells the model what's wrong with content instead of guessing", async () => {
    script([
      stream([
        toolCall("call_design", "design_qr", {
          brief: "Black on white",
          start_from: "new",
          content: {
            type: "wifi",
            ssid: "Cafe",
            password: "short",
            encryption: "WPA",
          },
        }),
      ]),
      stream(text("t1", "WPA passwords need 8 characters or more.")),
    ]);
    const { chunks } = await post([userMessage("wifi Cafe password short")]);
    const assistant = await assistantFrom(chunks);
    const design = toolPart(assistant, "tool-design_qr");
    expect(design?.state === "output-available" && design.output).toMatchObject(
      {
        ok: false,
        issues: [{ message: expect.stringMatching(/8-63/) }],
      },
    );
    // No design model call for invalid content.
    expect(gateway.calls.filter(isDesigner)).toHaveLength(0);
  });

  it("saves a template after approval, without content", async () => {
    script(
      [
        stream([
          toolCall("call_design", "design_qr", {
            brief: "Navy rounded dots with a 'Scan me' sticker frame",
            start_from: "new",
          }),
        ]),
        stream([
          toolCall("call_save", "save_template", {
            name: "Navy sticker",
            design_id: "call_design",
          }),
        ]),
        stream(text("t2", "Saved.")),
      ],
      [
        {
          ...REVISED,
          bgColor: "#FFFFFF",
          fgColor: "#1E3A8A",
          eyeColor: "#1E3A8A",
          dotColor: "#1E3A8A",
          logo: "none",
          frame: { style: "sticker", text: "Scan me" },
        },
      ],
    );
    const user = userMessage("Make a navy template with a sticker frame");
    const first = await post([user]);
    const assistant = await assistantFrom(first.chunks);
    expect(toolPart(assistant, "tool-save_template")?.state).toBe(
      "approval-requested",
    );
    expect(state.saved).toHaveLength(0);

    const approved = respondToApproval(assistant, true);
    const second = await post([user, approved]);
    const after = await assistantFrom(second.chunks, approved);
    const save = toolPart(after, "tool-save_template");
    expect(save?.state === "output-available" && save.output).toMatchObject({
      ok: true,
      name: "Navy sticker",
    });
    expect(state.saved).toEqual([
      {
        userId: "u_alice",
        name: "Navy sticker",
        style: expect.objectContaining({
          fgColor: "#1E3A8A",
          frame: { style: "sticker", text: "Scan me" },
          showLogo: false,
        }),
      },
    ]);
    // A template is a look only.
    expect(JSON.stringify(state.saved[0]?.style)).not.toContain("example.com");
    expect(state.reserved).toHaveLength(1);
  });

  it("refuses a template over the plan limit with the limit message", async () => {
    state.quotaAllowed = false;
    script([
      stream([toolCall("call_save", "save_template", { name: "Mine" })]),
      stream(text("t2", "You've reached the limit.")),
    ]);
    const { chunks } = await post([userMessage("Save this as a template")]);
    const assistant = await assistantFrom(chunks);
    const save = toolPart(assistant, "tool-save_template");
    expect(save?.state).toBe("output-denied");
    expect(save && "approval" in save && save.approval?.reason).toMatch(
      /limit of 10 saved themes/,
    );
    expect(state.saved).toHaveLength(0);
  });
});
