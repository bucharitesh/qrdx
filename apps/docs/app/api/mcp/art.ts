import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  ART_API_DOCS,
  artImageBytes,
  parseApiArtRequest,
  runApiArt,
  serializeArt,
} from "@/app/api/v1/art/_lib/art";
import {
  apiKeyRequiredError,
  optionalApiKeyCaller,
} from "@/app/api/v1/codes/_lib/api";
import {
  type AIArtCredits,
  ART_CREATIVITY,
  ART_MAX_SEED,
  ART_MODES,
  ART_NEGATIVE_PROMPT_MAX_LENGTH,
  ART_PROMPT_MAX_LENGTH,
  ART_QR_VISIBILITY,
  ART_TEXT_MAX_LENGTH,
} from "@/components/sections/ai-art/config";
import { ART_LOOK_IDS, ART_LOOKS } from "@/components/sections/ai-art/looks";
import { assertArtConfigured } from "@/lib/ai/art";
import { HttpError } from "@/lib/error-response";
import { getPlanLimits } from "@/lib/plans";
import { ValidationError } from "@/types/errors";

// The MCP server's AI art tool: generate_ai_art makes one image, like
// POST /v1/art, on the monthly AI art allowance of the API key's workspace.

const text = (value: string) => ({ type: "text" as const, text: value });

type ToolContext = {
  http?: { req?: Request };
  mcpReq?: { signal?: AbortSignal };
};

function toolError(error: unknown) {
  const body =
    error instanceof HttpError
      ? { code: error.code, message: error.message, status: error.status }
      : error instanceof ValidationError
        ? {
            code: "VALIDATION_ERROR",
            message: `${error.message}: ${(
              (error.details as { path: string; message: string }[]) ?? []
            )
              .map((issue) => `${issue.path || "body"}: ${issue.message}`)
              .join("; ")}`,
            status: 400,
          }
        : null;
  if (!body) return null;
  return {
    isError: true,
    content: [text(body.message), text(JSON.stringify(body))],
    structuredContent: body,
  };
}

// The REST body's fields. Defaults and rules are the app's own
// (aiArtRequestSchema), checked when the tool runs.
const artInput = z.object({
  text: z
    .string()
    .max(ART_TEXT_MAX_LENGTH)
    .optional()
    .describe(
      `What the code encodes: a link or text, up to ${ART_TEXT_MAX_LENGTH} characters. Send this or code, not both.`,
    ),
  code: z
    .string()
    .max(64)
    .optional()
    .describe(
      "The id of one of the workspace's dynamic codes: the art encodes its short link, so its destination stays editable and scans are counted. Send this or text, not both.",
    ),
  prompt: z
    .string()
    .max(ART_PROMPT_MAX_LENGTH)
    .optional()
    .describe(
      `The artwork to paint, in plain words (up to ${ART_PROMPT_MAX_LENGTH} characters), such as "a koi pond at dusk". Leave it out and QRdx writes one for the mode, look and photo; the result then says what it wrote.`,
    ),
  negativePrompt: z
    .string()
    .max(ART_NEGATIVE_PROMPT_MAX_LENGTH)
    .optional()
    .describe("What to keep out of the picture"),
  mode: z
    .enum(ART_MODES)
    .optional()
    .describe(
      'How the code sits in the art: "code" (default; the art painted into the code\'s modules), "scene" (a full-bleed picture with the code painted into something in it) or "photo" (your photo with the code painted into it; needs photo).',
    ),
  style: z
    .enum(ART_LOOK_IDS)
    .optional()
    .describe(
      `A quick look, added to the prompt: ${ART_LOOKS.map((look) => `${look.id} (${look.label})`).join(", ")}`,
    ),
  visibility: z
    .number()
    .int()
    .min(ART_QR_VISIBILITY.min)
    .max(ART_QR_VISIBILITY.max)
    .optional()
    .describe(
      `QR visibility, ${ART_QR_VISIBILITY.min}-${ART_QR_VISIBILITY.max} (default ${ART_QR_VISIBILITY.default}): higher shows the code more clearly, lower favors the picture`,
    ),
  creativity: z
    .number()
    .int()
    .min(ART_CREATIVITY.min)
    .max(ART_CREATIVITY.max)
    .optional()
    .describe(
      `${ART_CREATIVITY.min}-${ART_CREATIVITY.max} (default ${ART_CREATIVITY.default}): low follows the prompt literally, high interprets it freely`,
    ),
  seed: z
    .number()
    .int()
    .min(0)
    .max(ART_MAX_SEED)
    .optional()
    .describe("A seed, to make a similar image again"),
  photo: z
    .string()
    .optional()
    .describe(
      "Photo mode: your picture as a PNG or JPEG data: URL (data:image/jpeg;base64,…), cropped square and downsized to about 1024 px (at most 1 MB). It goes to the model and is discarded.",
    ),
  reference: z
    .string()
    .optional()
    .describe(
      "A reference image for the look, as a PNG or JPEG data: URL, downsized to about 512 px. It goes to the model and is discarded.",
    ),
});

function creditsLine(credits: AIArtCredits | null): string {
  if (!credits || credits.remaining === null) return "";
  const resets = new Date(credits.resetsAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return ` ${credits.remaining} of ${credits.limit} AI art images left this month${credits.pooled ? " (shared by the team)" : ""}; the allowance resets on ${resets}.`;
}

const BLEND_NOTE = {
  none: "the model's image as drawn",
  least:
    "the model's image, with the finders, quiet zone and modules strengthened just enough to scan",
  "image-qr": "redrawn as an Image QR code over the model's image",
} as const;

const allowance = (plan: "free" | "pro" | "business") =>
  getPlanLimits(plan).aiArtPerMonth;

export const ART_MCP_INSTRUCTIONS =
  " With an API key, generate_ai_art paints a QR code into AI artwork (a prompt, optionally a quick look, a scene or your photo) and checks that it scans; each image uses one of the workspace's paid monthly AI art images and takes up to a minute.";

export function registerArtTools(server: McpServer) {
  server.registerTool(
    "generate_ai_art",
    {
      title: "Generate AI QR art",
      description: `Paint a QR code into AI artwork from a description: the art painted into the code's modules (mode "code"), a full-bleed scene with the code painted into something in it ("scene"), or your own photo with the code painted into it ("photo"). QRdx checks that the image scans to the content and strengthens the code just enough when it doesn't. Encodes text, or a dynamic code's short link by its id (code) so the destination stays editable and scans are counted. Needs a QRdx API key with full access on this MCP connection (Authorization: Bearer qrdx_…). Each call uses one image from the workspace's paid monthly AI art allowance (${allowance("free")} on Free, ${allowance("pro")} on Pro, ${allowance("business")} on Business, shared by the team), refunded when no scannable image comes back, and takes 15-45 seconds, up to a minute. Returns a 1024 px PNG, the seed, how the code was made to scan and the images left this month.`,
      inputSchema: artInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        title: "Generate AI QR art",
      },
    },
    async (input, ctx: ToolContext) => {
      try {
        // Before the key, so a server without AI art uses none of the quota.
        assertArtConfigured();
        const req = ctx.http?.req ?? null;
        const caller = req
          ? await optionalApiKeyCaller(req, "write", "generate_ai_art")
          : null;
        if (!(req && caller)) throw apiKeyRequiredError("generate_ai_art");
        const { request, code } = await parseApiArtRequest(caller.scope, input);
        const result = await runApiArt(
          caller.scope,
          request,
          req,
          ctx.mcpReq?.signal ?? req.signal,
        );
        const { data, credits } = serializeArt(result, code);
        const { imageUrl, ...details } = data;
        const { bytes, mediaType } = artImageBytes(imageUrl);
        const written = data.writtenPrompt
          ? ` Description written for you: ${data.writtenPrompt}`
          : "";
        const summary = `AI QR art, ${data.width}x${data.height}px, ${data.mode} mode, seed ${data.seed}. It scans to ${data.text}${code ? ` (the short link of code ${code.id})` : ""}: checked by QRdx's scan check. Made to scan: ${BLEND_NOTE[data.blend]}.${written}${creditsLine(credits)} Docs: ${ART_API_DOCS}`;
        return {
          content: [
            text(summary),
            text(JSON.stringify({ ...details, credits }, null, 2)),
            {
              type: "image" as const,
              data: bytes.toString("base64"),
              mimeType: mediaType,
            },
          ],
        };
      } catch (error) {
        const failed = toolError(error);
        if (failed) return failed;
        throw error;
      }
    },
  );
}
