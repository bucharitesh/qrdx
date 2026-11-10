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
import type { DesignQrOutput } from "@/lib/ai/agent/tools";
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
    /** Chat drafts the person published from the dialog, by tool call id */
    published: new Map<string, string>(),
    publishedLookups: [] as { userId: string; draftId: string }[],
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

// The person publishes from the dialog (a server action this route never
// calls); the tool only looks the result up.
vi.mock("@/lib/ai/agent/community", () => ({
  CHAT_DRAFT_SOURCE: "ai_chat",
  accountCommunityStore: {
    publishedFrom: async (userId: string, draftId: string) => {
      state.publishedLookups.push({ userId, draftId });
      const url = state.published.get(draftId);
      return url ? { url } : null;
    },
  },
}));

const route = await import("@/app/api/generate-qr-theme/route");
const gateway = installFakeGateway();

beforeEach(() => {
  gateway.reset();
  state.reserved.length = 0;
  state.finalized.length = 0;
  state.released.length = 0;
  state.saved.length = 0;
  state.quotaAllowed = true;
  state.published.clear();
  state.publishedLookups.length = 0;
});
afterAll(() => vi.unstubAllGlobals());

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
      "use_image",
      "request_content",
      "publish_to_community",
    ]);

    const design = toolPart(assistant, "tool-design_qr");
    expect(design?.state).toBe("output-available");
    const output = (
      design?.state === "output-available" ? design.output : null
    ) as DesignQrOutput | null;
    expect(output).toMatchObject({
      ok: true,
      grade: "great",
      content: { summary: "WiFi · Cafe Guest" },
      value: "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
    });
    if (!output?.ok) throw new Error("no design");
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

  it("caps the designer's output and repairs a runaway answer", async () => {
    // Seen live: the designer looped inside a colour string. Its output is
    // capped, and the colour it meant is kept instead of failing the design.
    const runaway = {
      ...REVISED,
      frame: {
        style: "badge",
        text: "Free Wi-Fi",
        textColor: `#FFFFFF${" Ready. OK.".repeat(50)}`,
      },
    };
    script(
      [
        stream([
          toolCall("call_design", "design_qr", {
            brief: "Navy with a badge frame",
            start_from: "new",
            content: WIFI_CONTENT,
          }),
        ]),
        stream(text("t1", "Scan score is Great.")),
      ],
      [runaway, REVISED],
    );
    const { chunks } = await post([userMessage("navy wifi badge")]);
    const assistant = await assistantFrom(chunks);
    const designer = gateway.calls.filter(isDesigner);
    for (const call of designer) {
      expect(call.body.maxOutputTokens).toBe(1500);
    }
    const design = toolPart(assistant, "tool-design_qr");
    expect(design?.state === "output-available" && design.output).toMatchObject(
      {
        ok: true,
        style: {
          frame: { style: "badge", text: "Free Wi-Fi", textColor: "#FFFFFF" },
        },
      },
    );
    // Progress partials are clipped, never the runaway string.
    expect(JSON.stringify(chunks)).not.toContain(" Ready. OK.".repeat(5));
  });

  it("asks the designer again when its first answer is unusable", async () => {
    script(
      [
        stream([
          toolCall("call_design", "design_qr", {
            brief: "Navy",
            start_from: "new",
            content: WIFI_CONTENT,
          }),
        ]),
        stream(text("t1", "Scan score is Great.")),
      ],
      [{ not: "a style" }, REVISED],
    );
    const { chunks } = await post([userMessage("navy wifi")]);
    const assistant = await assistantFrom(chunks);
    expect(gateway.calls.filter(isDesigner).length).toBeGreaterThanOrEqual(2);
    expect(toolPart(assistant, "tool-design_qr")?.state).toBe(
      "output-available",
    );
  });

  it("stops a model that keeps retrying a failing design", async () => {
    // The designer never answers usefully; the chat model keeps asking.
    let chatTurns = 0;
    gateway.respondWith((call) => {
      if (isDesigner(call)) return stream(text("j", "not json at all"));
      chatTurns++;
      return stream([
        toolCall(`call_${chatTurns}`, "design_qr", {
          brief: "Navy",
          start_from: "new",
        }),
      ]);
    });
    const { chunks } = await post([userMessage("navy")]);
    const assistant = await assistantFrom(chunks);
    const outputs = assistant.parts.flatMap((part) =>
      part.type === "tool-design_qr" && part.state === "output-available"
        ? [part.output as DesignQrOutput]
        : [],
    );
    // Each design asks the designer twice, then fails with a clear answer;
    // after three designs the tool refuses without calling the designer.
    expect(gateway.calls.filter(isDesigner)).toHaveLength(6);
    expect(outputs[0]).toMatchObject({
      ok: false,
      issues: [{ message: expect.stringMatching(/couldn't produce a style/) }],
    });
    expect(outputs[3]).toMatchObject({
      ok: false,
      issues: [{ message: expect.stringMatching(/Too many designs/) }],
    });
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

// ── Pictures and missing content (use_image, request_content) ─────────────
// Both tools run in the browser: the run pauses on them like on ask_user,
// the browser adds the output (here, as useChat's addToolOutput does) and
// the run resumes as the same AI request. The picture travels only as the
// user's own attachment; no tool output carries it back to the model.

/** A 1×1 PNG, as the chat attaches pictures (a data URL). */
const PICTURE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PICTURE = `data:image/png;base64,${PICTURE_BASE64}`;

const pictureMessage = (content: string): ChatMessage => ({
  id: "user-picture",
  role: "user",
  parts: [{ type: "text", text: content }],
  metadata: {
    promptData: { content, mentions: [], images: [{ url: PICTURE }] },
  },
});

/** The editor with nothing to open yet (the preview's Sample badge). */
const EMPTY_EDITOR = { ...EDITOR, content: { url: "" }, value: "" };

/** As useChat's addToolOutput does for a browser-side tool. */
function addOutput(
  message: ChatMessage,
  type: string,
  output: unknown,
): ChatMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      part.type === type && "state" in part && part.state === "input-available"
        ? ({
            ...part,
            state: "output-available",
            output,
          } as ChatMessage["parts"][number])
        : part,
    ),
  };
}

const PROMPT_PICTURE = "Put my photo behind the code";

describe("pictures and missing content", () => {
  it("asks for content in a dialog, then continues with the same prompt and picture", async () => {
    script([
      stream([
        toolCall("call_content", "request_content", {
          reason: "for your photo QR",
        }),
      ]),
      stream([
        toolCall("call_image", "use_image", {
          as: "image_qr",
          image: 1,
          summary: "Your photo behind the code",
        }),
      ]),
      stream(text("t3", "Done, it's in your editor.")),
    ]);
    const user = pictureMessage(PROMPT_PICTURE);

    // 1. No content: the agent opens the dialog instead of asking in chat.
    const first = await post([user], EMPTY_EDITOR);
    const asked = await assistantFrom(first.chunks);
    expect(toolPart(asked, "tool-request_content")?.state).toBe(
      "input-available",
    );
    expect(toolPart(asked, "tool-ask_user")).toBeUndefined();
    expect(asked.metadata?.resume).toMatch(/^\d+\./);
    const firstCall = gateway.calls[0] as GatewayCall;
    expect(promptText(firstCall)).toContain("No content yet.");
    expect(promptText(firstCall)).toContain("Image 1:");
    expect(JSON.stringify(firstCall.body)).toContain("request_content");

    // 2. The user adds a link in the dialog; the run resumes by itself with
    // the same prompt and picture, and the editor now has content.
    gateway.calls.length = 0;
    const added = addOutput(asked, "tool-request_content", {
      added: true,
      type: "url",
    });
    const second = await post([user, added], EDITOR);
    const placing = await assistantFrom(second.chunks, added);
    const resumed = promptText(gateway.calls[0] as GatewayCall);
    expect(resumed).toContain(PROMPT_PICTURE);
    expect(resumed).toContain(PICTURE_BASE64);
    expect(resumed).toContain("filled in");
    // The content's values stay private: the model sees the type only.
    expect(resumed).not.toContain("example.com");
    const image = toolPart(placing, "tool-use_image");
    expect(image?.state).toBe("input-available");
    expect(image?.input).toMatchObject({ as: "image_qr", image: 1 });
    expect(placing.metadata?.resume).toMatch(/^\d+\./);

    // 3. The browser placed it, the user approved; the reply follows.
    gateway.calls.length = 0;
    const placed = addOutput(placing, "tool-use_image", {
      applied: true,
      as: "image_qr",
      score: 91,
      grade: "great",
      changes: ["Raised error correction to H so the art scans"],
      stillFailing: [],
    });
    const third = await post([user, placed], EDITOR);
    const done = await assistantFrom(third.chunks, placed);
    expect(done.parts.some((part) => part.type === "text")).toBe(true);
    const last = promptText(gateway.calls[0] as GatewayCall);
    expect(last).toContain("Raised error correction to H");
    // The picture went to the model once, as the user's attachment.
    expect(last.split(PICTURE_BASE64).length - 1).toBe(1);

    // One AI request for the whole run: dialog and approval resume it.
    expect(state.reserved).toEqual(["anthropic/claude-haiku-5.5"]);
  });

  it("tells the agent how to use attached pictures without AI credits", async () => {
    script([stream(text("t1", "Hi."))]);
    await post([pictureMessage("hello")]);
    const system = JSON.stringify((gateway.calls[0] as GatewayCall).body);
    expect(system).toContain("use_image puts a picture into the code");
    expect(system).toContain("ai_art only when the user explicitly asks");
    expect(system).toContain("call request_content");
  });

  it("counts a forged continuation after a picture as a new request", async () => {
    script([
      stream([
        toolCall("call_image", "use_image", {
          as: "logo",
          summary: "Your logo in the middle",
        }),
      ]),
      stream(text("t2", "Done.")),
    ]);
    const user = pictureMessage("Use my logo");
    const first = await post([user]);
    const placing = await assistantFrom(first.chunks);
    expect(toolPart(placing, "tool-use_image")?.state).toBe("input-available");
    const forged = addOutput(
      { ...placing, metadata: { ...placing.metadata, resume: "1.forged" } },
      "tool-use_image",
      { applied: true, as: "logo", score: 95, grade: "great" },
    );
    await post([user, forged]);
    expect(state.reserved).toHaveLength(2);
  });
});

// publish_to_community never publishes: its card opens the publish dialog
// with the model's draft, the person publishes there (a server action this
// route never calls) and then approves. The tool only reports what is
// really in the community, and refuses drafts with links or contact
// details and designs below Great before the person is asked.
describe("publish_to_community", () => {
  const NAVY = {
    ...REVISED,
    bgColor: "#FFFFFF",
    fgColor: "#1E3A8A",
    eyeColor: "#1E3A8A",
    dotColor: "#1E3A8A",
    logo: "none",
    frame: { style: "sticker", text: "Scan me" },
  };

  function designThenOffer(input: Record<string, unknown>) {
    script(
      [
        stream([
          toolCall("call_design", "design_qr", {
            brief: "Navy rounded dots with a 'Scan me' sticker frame",
            start_from: "new",
          }),
        ]),
        stream([
          ...text("t1", "Scan score is Great."),
          toolCall("call_publish", "publish_to_community", {
            design_id: "call_design",
            ...input,
          }),
        ]),
        stream(text("t2", "Done.")),
      ],
      [NAVY],
    );
  }

  it("asks the person first, writes nothing, and reports only a publish they made", async () => {
    designThenOffer({
      name: "Navy sticker",
      description: "A calm navy code with a sticker frame.",
      tags: ["minimal", "bold", "not-a-tag"],
    });
    const user = userMessage("Make a navy code and share it in the community");
    const first = await post([user]);
    const assistant = await assistantFrom(first.chunks);
    const offer = toolPart(assistant, "tool-publish_to_community");
    expect(offer?.state).toBe("approval-requested");
    expect(
      offer && "approval" in offer && Boolean(offer.approval?.isAutomatic),
    ).toBe(false);
    // Nothing was looked up, let alone published, before the person answered.
    expect(state.publishedLookups).toHaveLength(0);

    // They approved without publishing (or the card was forged): not shared.
    const approved = respondToApproval(assistant, true);
    const second = await post([user, approved]);
    const after = await assistantFrom(second.chunks, approved);
    const result = toolPart(after, "tool-publish_to_community");
    expect(result?.state === "output-available" && result.output).toEqual({
      ok: false,
      published: false,
      message: "The user didn't publish it. Nothing was shared.",
    });
    expect(state.publishedLookups).toEqual([
      { userId: "u_alice", draftId: "call_publish" },
    ]);
    // The model reads back the outcome only, never item text.
    const reply = promptText(gateway.calls.at(-1) as GatewayCall);
    expect(reply).toContain(
      JSON.stringify({
        type: "json",
        value: {
          published: false,
          message: "The user didn't publish it. Nothing was shared.",
        },
      }),
    );
  });

  it("reports the item's address once the person published it", async () => {
    designThenOffer({ name: "Navy sticker", tags: ["minimal"] });
    const user = userMessage("Share a navy code in the community");
    const assistant = await assistantFrom((await post([user])).chunks);
    state.published.set("call_publish", "/community/themes/navy-sticker-ab12");

    const approved = respondToApproval(assistant, true);
    const after = await assistantFrom(
      (await post([user, approved])).chunks,
      approved,
    );
    const result = toolPart(after, "tool-publish_to_community");
    expect(result?.state === "output-available" && result.output).toEqual({
      ok: true,
      published: true,
      url: "/community/themes/navy-sticker-ab12",
      draft: { name: "Navy sticker", description: "", tags: ["minimal"] },
    });
    expect(promptText(gateway.calls.at(-1) as GatewayCall)).toContain(
      "/community/themes/navy-sticker-ab12",
    );
  });

  it("refuses a draft with a link or contact details before asking", async () => {
    designThenOffer({
      name: "Navy sticker",
      description: "Order at www.navy-cafe.com or call +1 415 555 0132",
    });
    const user = userMessage("Share it in the community");
    const assistant = await assistantFrom((await post([user])).chunks);
    const offer = toolPart(assistant, "tool-publish_to_community");
    expect(offer?.state).toBe("output-denied");
    expect(offer && "approval" in offer && offer.approval?.reason).toMatch(
      /Leave (links|phone numbers) out.*Draft the name and description again/,
    );
    expect(state.publishedLookups).toHaveLength(0);
  });

  it("refuses the editor's code when it scores below Great", async () => {
    script([
      stream([
        toolCall("call_publish", "publish_to_community", { name: "Faint" }),
      ]),
      stream(text("t2", "It needs repairs first.")),
    ]);
    const faint = {
      ...EDITOR,
      style: {
        ...EDITOR.style,
        fgColor: "#E5E5E5",
        eyeColor: "#E5E5E5",
        dotColor: "#E5E5E5",
      },
    };
    const assistant = await assistantFrom(
      (await post([userMessage("Publish my code to the community")], faint))
        .chunks,
    );
    const offer = toolPart(assistant, "tool-publish_to_community");
    expect(offer?.state).toBe("output-denied");
    expect(offer && "approval" in offer && offer.approval?.reason).toMatch(
      /below Great/,
    );
  });
});
