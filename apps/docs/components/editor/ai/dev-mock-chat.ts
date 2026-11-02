// Dev-only replay of /api/generate-qr-theme's UI message stream: the same
// chunk sequence the agent route produces (design progress, tool results,
// approval requests, questions), loaded only in development. The scores and
// changes here are a fixed recording, not a live check.
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type {
  ApplyDesignOutput,
  DesignQrOutput,
  SaveTemplateOutput,
} from "@/lib/ai/agent/tools";
import type { ChatMessage } from "@/types/ai";
import type { AIMockMode } from "./dev-mock-mode";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const STYLE = {
  bgColor: "#FFF7ED",
  fgColor: "#9A3412",
  eyeColor: "#7C2D12",
  dotColor: "#7C2D12",
  bodyPattern: "circle",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "circle",
  margin: 4,
  level: "Q",
  frame: { style: "banner-bottom", text: "Free Wi-Fi" },
  templateId: "default",
  logo: "none",
} as const;

const CONTENT = {
  config: {
    type: "wifi",
    ssid: "Cafe Guest",
    password: "sunshine123",
    encryption: "WPA",
  },
  summary: "WiFi · Cafe Guest",
} as const;

const DESIGN: Extract<DesignQrOutput, { ok: true }> = {
  ok: true,
  designId: "mock-design",
  content: CONTENT,
  value: "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;H:false;;",
  scoredWithSample: false,
  style: STYLE,
  themeStyles: {
    bgColor: STYLE.bgColor,
    fgColor: STYLE.fgColor,
    eyeColor: STYLE.eyeColor,
    dotColor: STYLE.dotColor,
    bodyPattern: STYLE.bodyPattern,
    cornerEyePattern: STYLE.cornerEyePattern,
    cornerEyeDotPattern: STYLE.cornerEyeDotPattern,
    margin: 4,
    level: "Q",
    frame: { style: "banner-bottom", text: "Free Wi-Fi" },
    showLogo: false,
  },
  logo: { showLogo: false },
  score: 85,
  grade: "great",
  failed: [],
  repairs: 1,
  fellBack: false,
  changes: [
    "Dots: #FDBA74 → #9A3412",
    "Corner eyes: #FB923C → #7C2D12",
    "Eye shape: circle → rounded",
  ],
  attempts: [
    { score: 41, grade: "risky", by: "initial", changes: [] },
    {
      score: 85,
      grade: "great",
      by: "model",
      changes: ["Dots: #FDBA74 → #9A3412", "Eye shape: circle → rounded"],
    },
  ],
  replacesArt: false,
};

type Writer = Parameters<
  Parameters<typeof createUIMessageStream<ChatMessage>>[0]["execute"]
>[0]["writer"];

async function text(writer: Writer, id: string, value: string) {
  writer.write({ type: "text-start", id });
  for (const word of value.split(/(?<= )/)) {
    writer.write({ type: "text-delta", id, delta: word });
    await sleep(35);
  }
  writer.write({ type: "text-end", id });
}

async function design(writer: Writer, toolCallId: string) {
  writer.write({ type: "tool-input-start", toolCallId, toolName: "design_qr" });
  writer.write({
    type: "tool-input-available",
    toolCallId,
    toolName: "design_qr",
    input: {
      brief: "Warm orange with a Free Wi-Fi frame",
      start_from: "new",
      content: { ...CONTENT.config },
    },
  });
  writer.write({
    type: "data-design-progress",
    id: toolCallId,
    data: { stage: "designing" },
    transient: true,
  });
  await sleep(900);
  DESIGN.attempts.forEach((attempt, index) => {
    writer.write({
      type: "data-design-progress",
      id: toolCallId,
      data: { stage: "scored", index, ...attempt },
      transient: true,
    });
  });
  await sleep(700);
  writer.write({
    type: "tool-output-available",
    toolCallId,
    output: { ...DESIGN, designId: toolCallId },
  });
}

function lastAssistant(init?: RequestInit): ChatMessage | null {
  try {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: ChatMessage[];
    };
    const last = body.messages?.at(-1);
    return last?.role === "assistant" ? last : null;
  } catch {
    return null;
  }
}

export function mockChatResponse(
  mode: AIMockMode,
  init?: RequestInit,
): Response {
  const resumed = lastAssistant(init);
  const stream = createUIMessageStream<ChatMessage>({
    originalMessages: resumed ? [resumed] : undefined,
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      await sleep(400);

      const respond = resumed?.parts.find(
        (part) => "state" in part && part.state === "approval-responded",
      ) as
        | {
            type: string;
            toolCallId: string;
            approval: { approved: boolean };
          }
        | undefined;
      if (respond) {
        if (!respond.approval.approved) {
          writer.write({
            type: "tool-output-denied",
            toolCallId: respond.toolCallId,
          });
          await text(writer, "t-no", "Okay, I left your code as it was.");
        } else if (respond.type === "tool-save_template") {
          const output: SaveTemplateOutput = {
            ok: true,
            id: "mock-theme",
            name: "Warm Wi-Fi",
            style: DESIGN.themeStyles,
          };
          writer.write({
            type: "tool-output-available",
            toolCallId: respond.toolCallId,
            output,
          });
          await text(writer, "t-saved", "Saved as **Warm Wi-Fi**.");
        } else {
          const output: ApplyDesignOutput = {
            ok: true,
            designId: DESIGN.designId,
            content: DESIGN.content,
            themeStyles: DESIGN.themeStyles,
            logo: DESIGN.logo,
            score: DESIGN.score,
            grade: DESIGN.grade,
            changes: DESIGN.changes,
            followups: ["Make it darker", "Add the Wi-Fi logo"],
          };
          writer.write({
            type: "tool-output-available",
            toolCallId: respond.toolCallId,
            output,
          });
          await text(writer, "t-done", "Done. It's in your editor.");
        }
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish", finishReason: "stop" });
        return;
      }

      if (mode === "chat") {
        await text(
          writer,
          "t-chat",
          "Hi! Tell me what the code should open (a link, Wi-Fi, a contact) and how it should look.",
        );
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish", finishReason: "stop" });
        return;
      }

      const answered = resumed?.parts.some(
        (part) =>
          part.type === "tool-ask_user" && part.state === "output-available",
      );
      if (mode === "ask" && !answered) {
        writer.write({
          type: "tool-input-start",
          toolCallId: "mock-ask",
          toolName: "ask_user",
        });
        writer.write({
          type: "tool-input-available",
          toolCallId: "mock-ask",
          toolName: "ask_user",
          input: {
            question: "Which Wi-Fi security does Cafe Guest use?",
            options: ["WPA/WPA2/WPA3", "WEP", "No password"],
          },
        });
        writer.write({ type: "finish-step" });
        writer.write({
          type: "finish",
          finishReason: "tool-calls",
          messageMetadata: { resume: "mock" },
        });
        return;
      }

      if (mode === "template" || mode === "limit") {
        writer.write({
          type: "tool-input-start",
          toolCallId: "mock-save",
          toolName: "save_template",
        });
        writer.write({
          type: "tool-input-available",
          toolCallId: "mock-save",
          toolName: "save_template",
          input: { name: "Warm Wi-Fi" },
        });
        if (mode === "limit") {
          writer.write({
            type: "tool-approval-request",
            approvalId: "mock-approval",
            toolCallId: "mock-save",
            isAutomatic: true,
          });
          writer.write({
            type: "tool-approval-response",
            approvalId: "mock-approval",
            approved: false,
            reason:
              "You have reached the limit of 10 saved themes on the Free plan. Upgrade to Pro for unlimited themes.",
          });
          writer.write({ type: "tool-output-denied", toolCallId: "mock-save" });
          writer.write({ type: "finish-step" });
          writer.write({ type: "start-step" });
          await text(
            writer,
            "t-limit",
            "You've reached the 10 saved themes the Free plan includes.",
          );
          writer.write({ type: "finish-step" });
          writer.write({ type: "finish", finishReason: "stop" });
          return;
        }
        writer.write({
          type: "tool-approval-request",
          approvalId: "mock-approval",
          toolCallId: "mock-save",
        });
        writer.write({ type: "finish-step" });
        writer.write({
          type: "finish",
          finishReason: "tool-calls",
          messageMetadata: { resume: "mock" },
        });
        return;
      }

      await design(writer, "mock-design");
      if (mode === "error") {
        writer.write({ type: "error", errorText: "Mock: generation failed" });
        return;
      }
      writer.write({ type: "finish-step" });
      writer.write({ type: "start-step" });
      await text(
        writer,
        "t-score",
        "Scan score 85, **Great**. I darkened the orange and rounded the corner eyes to get there.",
      );
      writer.write({
        type: "tool-input-start",
        toolCallId: "mock-apply",
        toolName: "apply_design",
      });
      writer.write({
        type: "tool-input-available",
        toolCallId: "mock-apply",
        toolName: "apply_design",
        input: {
          design_id: "mock-design",
          summary: "Wi-Fi code for Cafe Guest in warm orange",
        },
      });
      writer.write({
        type: "tool-approval-request",
        approvalId: "mock-apply-approval",
        toolCallId: "mock-apply",
      });
      writer.write({ type: "finish-step" });
      writer.write({
        type: "finish",
        finishReason: "tool-calls",
        messageMetadata: { resume: "mock" },
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
