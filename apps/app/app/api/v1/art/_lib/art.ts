import "server-only";

import { z } from "zod";
import {
  codeIdSchema,
  getCode,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  type AIArtCredits,
  type AIArtResult,
  ART_TEXT_MAX_LENGTH,
  aiArtRequestSchema,
  type ParsedAIArtRequest,
} from "@/components/sections/ai-art/config";
import { assertArtConfigured } from "@/lib/ai/art";
import { runArt } from "@/lib/ai/art-run";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import type { ActiveScope } from "@/lib/scope";
import { SubscriptionRequiredError, ValidationError } from "@/types/errors";

// AI QR art for the REST API (POST /v1/art) and the MCP server
// (generate_ai_art): the app's request (aiArtRequestSchema), where a dynamic
// code's id can stand in for `text`, run by lib/ai/art-run.ts on the API
// key's workspace, so it uses the same monthly allowance as the app.

export const ART_API_DOCS = `${baseUrl.origin}/docs/developers/ai-art-api`;

/** What the art encodes: `text` itself, or a dynamic code's short link. */
const targetSchema = z
  .looseObject({
    text: z.unknown().optional(),
    code: codeIdSchema.optional(),
  })
  .superRefine((body, ctx) => {
    if ((body.text === undefined) === (body.code === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message:
          "Send exactly one of text (what the code encodes) and code (the id of one of your dynamic codes)",
      });
    }
  });

/** The dynamic code the art encodes, when the request named one. */
export interface ArtCode {
  id: string;
  shortLink: string;
}

export interface ApiArtRequest {
  request: ParsedAIArtRequest;
  code: ArtCode | null;
}

const IMAGE_FIELDS = new Set(["photo", "reference"]);

/** The app schema's issues, with the two that have their own error code. */
function invalid(issues: z.core.$ZodIssue[]): Error {
  const text = issues.find(
    (issue) => issue.path[0] === "text" && issue.code === "too_big",
  );
  if (text) {
    return new HttpError(
      400,
      "AI_ART_TEXT_TOO_LONG",
      `text is too long for AI art (at most ${ART_TEXT_MAX_LENGTH} characters). Send a dynamic code's id as code instead: the art then encodes its short link.`,
      undefined,
      ART_API_DOCS,
    );
  }
  const image = issues.find(
    (issue) =>
      IMAGE_FIELDS.has(String(issue.path[0])) &&
      (issue.code === "too_big" || /too large/i.test(issue.message)),
  );
  if (image) {
    return new HttpError(
      413,
      "AI_ART_IMAGE_TOO_LARGE",
      `${String(image.path[0])}: ${image.message}. Downsize it before sending it.`,
      undefined,
      ART_API_DOCS,
    );
  }
  return new ValidationError(
    "Invalid request body",
    issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}

/**
 * Validates a request body: exactly one of `text` and `code`, then the app's
 * own request schema. A code is looked up in the scope's workspace (one
 * elsewhere, or in the trash, is a 404) and the art encodes its short link,
 * so its destination stays editable and its scans are counted.
 */
export async function parseApiArtRequest(
  scope: ActiveScope,
  body: unknown,
): Promise<ApiArtRequest> {
  const target = targetSchema.safeParse(body);
  if (!target.success) throw invalid(target.error.issues);
  const { code: codeId, ...fields } = target.data;

  let code: ArtCode | null = null;
  if (codeId !== undefined) {
    const found = await getCode(scope, codeId);
    code = { id: found.id, shortLink: found.shortLink };
    fields.text = found.shortLink;
  }

  // The app's sealed scene picture (POST /api/ai/art/picture) isn't part of
  // the API: scene mode makes its picture in the same request here.
  if ("picture" in fields) {
    throw new ValidationError("Invalid request body", [
      {
        path: "picture",
        message:
          "picture isn't an API field: scene mode makes its picture in the same request",
      },
    ]);
  }
  const parsed = aiArtRequestSchema.safeParse(fields);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return { request: parsed.data, code };
}

/**
 * One image on the scope's monthly allowance (lib/ai/art-run.ts). Running
 * out is AI_ART_CREDITS_EXHAUSTED on every plan: 402 where an upgrade adds
 * more, 429 on Business.
 */
export async function runApiArt(
  scope: ActiveScope,
  request: ParsedAIArtRequest,
  req: Request,
  signal: AbortSignal,
): Promise<AIArtResult> {
  assertArtConfigured();
  try {
    return await runArt({ scope, request, req, signal });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      throw new HttpError(
        402,
        "AI_ART_CREDITS_EXHAUSTED",
        error.message,
        undefined,
        `${baseUrl.origin}/pricing`,
        error.data as Record<string, unknown> | undefined,
      );
    }
    throw error;
  }
}

/** The public JSON shape of a generated image. */
export interface ApiArtImage {
  /** The image itself, as a data: URL (nothing is stored) */
  imageUrl: string;
  width: number;
  height: number;
  seed: number;
  mode: AIArtResult["mode"];
  blend: AIArtResult["variant"]["blend"];
  blendStrength: number;
  /** Exactly what the image scans to */
  text: string;
  code: ArtCode | null;
  visibility: number;
  creativity: number;
  /** The description QRdx wrote, when the request had no prompt */
  writtenPrompt?: string;
}

export function serializeArt(
  result: AIArtResult,
  code: ArtCode | null,
): { data: ApiArtImage; credits: AIArtCredits | null } {
  const { variant } = result;
  return {
    data: {
      imageUrl: variant.imageUrl,
      width: variant.width,
      height: variant.height,
      seed: variant.seed,
      mode: result.mode,
      blend: variant.blend,
      blendStrength: variant.blendStrength,
      text: result.text,
      code,
      visibility: result.visibility,
      creativity: result.creativity,
      ...(result.writtenPrompt && { writtenPrompt: result.writtenPrompt }),
    },
    credits: result.credits,
  };
}

/** The image's bytes and media type, from its data: URL. */
export function artImageBytes(imageUrl: string): {
  bytes: Buffer;
  mediaType: string;
} {
  const comma = imageUrl.indexOf(",");
  const mediaType =
    /^data:([^;,]+)/.exec(imageUrl.slice(0, comma))?.[1] ?? "image/png";
  return {
    bytes: Buffer.from(imageUrl.slice(comma + 1), "base64"),
    mediaType,
  };
}
