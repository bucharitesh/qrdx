import { MAX_AI_REQUEST_BODY_BYTES } from "@repo/config";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type { NextRequest } from "next/server";
import { accountCommunityStore } from "@/lib/ai/agent/community";
import {
  describeEditorForModel,
  editorBase,
  editorContextSchema,
} from "@/lib/ai/agent/editor-context";
import { toAgentModelMessages } from "@/lib/ai/agent/messages";
import { CLIENT_TOOL_NAMES } from "@/lib/ai/agent/picture-tools";
import { QR_AGENT_PICTURES, QR_AGENT_SYSTEM } from "@/lib/ai/agent/prompts";
import {
  createResumeToken,
  toolApprovalSecret,
  verifyResumeToken,
} from "@/lib/ai/agent/resume";
import { accountTemplateStore } from "@/lib/ai/agent/templates";
import {
  type AgentContext,
  agentToolApproval,
  DesignRegistry,
  QR_AGENT_TOOLS,
} from "@/lib/ai/agent/tools";
import { textProviderOptions } from "@/lib/ai/models";
import { assertAIConfigured, languageModel } from "@/lib/ai/providers";
import { streamErrorMessage } from "@/lib/ai/stream-error-message";
import { handleError } from "@/lib/error-response";
import { scoreDesign } from "@/lib/qr-design/score";
import {
  enforceAIRateLimit,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { getCurrentUserId, logError } from "@/lib/shared";
import {
  finalizeAIRequest,
  releaseAIRequest,
  reserveAIRequest,
} from "@/lib/subscription";
import { generateQRThemeRequestSchema } from "@/lib/validations/ai";
import type { ChatMessage } from "@/types/ai";

// The AI chat in the editor's Generate tab: an agent (lib/ai/models.ts
// "base") that designs any kind of QR code with the tools in
// lib/ai/agent/tools.ts. Runs pause for the user (ask_user, and approval
// before apply_design, save_template or publish_to_community) and resume
// with a second request
// that carries the answer; lib/ai/agent/resume.ts keeps those from being
// counted as new AI requests.

/** Model calls in one request: design, a short reply, an approval. */
const MAX_STEPS = 8;

const requestSchema = generateQRThemeRequestSchema.extend({
  editor: editorContextSchema.optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Before the session lookup: with AI off there's nothing to sign in for.
    assertAIConfigured();
    const userId = await getCurrentUserId(req);
    await enforceAIRateLimit(req, "generate-qr-theme", userId);

    const body = parseWithSchema(
      requestSchema,
      await readJsonBody(req, MAX_AI_REQUEST_BODY_BYTES),
    );
    const messages = body.messages as unknown as ChatMessage[];
    const base = editorBase(body.editor);
    const tools = QR_AGENT_TOOLS;
    const modelMessages = await toAgentModelMessages(messages, tools);

    const model = languageModel("base");
    const modelId = typeof model === "string" ? model : model.modelId;
    // A run resumed after the user answered or approved is the same request.
    const last = messages.at(-1);
    const resuming =
      last?.role === "assistant" &&
      verifyResumeToken(last.metadata?.resume, userId, messages);
    const usageId = resuming ? null : await reserveAIRequest(userId, modelId);

    const stream = createUIMessageStream<ChatMessage>({
      // A resumed run continues the same assistant message.
      originalMessages: messages,
      onError: streamErrorMessage,
      execute: ({ writer }) => {
        const context: AgentContext = {
          userId,
          base,
          designs: DesignRegistry.fromMessages(messages),
          writer,
          templates: accountTemplateStore,
          community: accountCommunityStore,
          score: scoreDesign,
          designCalls: { count: 0 },
        };
        const result = streamText({
          abortSignal: req.signal,
          model,
          providerOptions: textProviderOptions("base"),
          instructions: `${QR_AGENT_SYSTEM}\n\n${QR_AGENT_PICTURES}\n\n${describeEditorForModel(base)}`,
          messages: modelMessages,
          tools,
          toolApproval: agentToolApproval(),
          experimental_toolApprovalSecret: toolApprovalSecret(),
          stopWhen: isStepCount(MAX_STEPS),
          toolsContext: {
            design_qr: context,
            check_scan_score: context,
            apply_design: context,
            save_template: context,
            publish_to_community: context,
          },
          onError: async ({ error }) => {
            logError(error as Error, { route: "/api/generate-qr-theme" });
            if (!usageId) return;
            await releaseAIRequest(usageId).catch((releaseError) =>
              logError(releaseError as Error, { action: "releaseAIRequest" }),
            );
          },
          // `usage` covers every step (v6's `totalUsage`).
          onEnd: async ({ usage }) => {
            if (!usageId) return;
            try {
              await finalizeAIRequest(usageId, usage);
            } catch (error) {
              logError(error as Error, {
                action: "finalizeAIRequest",
                totalUsage: usage,
              });
            }
          },
        });

        // Did the run stop to wait for the user?
        let waiting = false;
        writer.merge(
          toUIMessageStream<typeof tools, ChatMessage>({
            stream: result.stream,
            tools,
            originalMessages: messages,
            onError: streamErrorMessage,
            messageMetadata: ({ part }) => {
              if (
                part.type === "tool-call" &&
                CLIENT_TOOL_NAMES.has(part.toolName)
              ) {
                waiting = true;
              }
              if (part.type === "tool-approval-request" && !part.isAutomatic) {
                waiting = true;
              }
              if (part.type === "finish" && waiting) {
                return { resume: createResumeToken(userId, messages) };
              }
            },
          }),
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "ResponseAborted")
    ) {
      return new Response("Request aborted by user", { status: 499 });
    }

    return handleError(error, { route: "/api/generate-qr-theme" });
  }
}
