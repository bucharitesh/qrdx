// The chat's browser-side tools for pictures and missing content. Neither has
// an execute: the browser does the work and sends the result back as the
// tool's output, as it does for ask_user.
//
// - use_image puts a picture the user attached into the code (logo, Logo QR
//   or Image QR art, a background or dots fill), checks its scan score,
//   repairs it toward Great and waits for the user to approve, all in the
//   editor (components/editor/ai/image-placement.ts) with no AI credits. The
//   picture never comes back to the model: the output is the score, the
//   checks and what changed.
// - request_content opens a dialog for what the code opens (a link or a
//   content type's form) when the editor has none; the run continues once
//   the user adds it. Its output names the type only, never the values.
import { type Tool, tool } from "ai";
import z from "zod";
import { IMAGE_USES } from "./image-uses";

const useImageInput = z.object({
  as: z
    .enum(IMAGE_USES)
    .describe(
      "logo: the center logo. logo_qr: a logo traced into the dots. image_qr: a photo blended into the dots (behind the code). background: the picture as the code's background. dots: the picture painting the dots. ai_art: AI art from the picture, only when the user asks for AI art (it uses paid credits).",
    ),
  image: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Which attached picture, by its number (Image 1 is the first one attached in this chat). Leave out for the latest.",
    ),
  design_id: z
    .string()
    .optional()
    .describe(
      "A designId from design_qr to put the picture on (its content and look, in one approval). Leave out to use the code in the editor.",
    ),
  summary: z
    .string()
    .describe(
      "One short sentence for the approval card, e.g. 'Your photo behind the code'",
    ),
  followups: z
    .array(z.string())
    .optional()
    .describe("Up to 3 short next steps, e.g. 'Add a frame'"),
});

const useImageOutput = z.object({
  /** The user approved and the picture is in the editor */
  applied: z.boolean(),
  /** The way it was placed (the user may pick another one in the card) */
  as: z.enum(IMAGE_USES),
  score: z.number().optional(),
  grade: z.enum(["great", "ok", "risky", "fails"]).optional(),
  changes: z.array(z.string()).optional(),
  /** Checks still failing, in plain words */
  stillFailing: z.array(z.string()).optional(),
  /** What happened, for the reply ("The user rejected it.") */
  note: z.string().optional(),
});

const requestContentInput = z.object({
  reason: z
    .string()
    .optional()
    .describe(
      "What the content is for, a few words shown in the dialog, e.g. 'for your photo QR'",
    ),
});

const requestContentOutput = z.object({
  /** The user added content (the editor holds it now) */
  added: z.boolean(),
  /** Its content type, e.g. "url" or "wifi"; never its values */
  type: z.string().optional(),
});

export type UseImageInput = z.infer<typeof useImageInput>;
export type UseImageOutput = z.infer<typeof useImageOutput>;
export type RequestContentInput = z.infer<typeof requestContentInput>;
export type RequestContentOutput = z.infer<typeof requestContentOutput>;

export type PictureTools = {
  use_image: Tool<UseImageInput, UseImageOutput>;
  request_content: Tool<RequestContentInput, RequestContentOutput>;
};

export const PICTURE_TOOLS: PictureTools = {
  use_image: tool({
    description:
      "Put a picture the user attached into the code, in the editor with no AI credits: as the center logo, Logo QR or Image QR art, the background or the dots. It checks the scan score, repairs it toward Great and asks the user to approve, like apply_design. The run pauses until they decide.",
    inputSchema: useImageInput,
    outputSchema: useImageOutput,
  }),
  request_content: tool({
    description:
      "Open a dialog where the user adds what the code opens (a link, or Wi-Fi, a contact, WhatsApp, email and the other types) when the editor has none. The run pauses and continues once they add it.",
    inputSchema: requestContentInput,
    outputSchema: requestContentOutput,
  }),
};

/** Tools the browser answers; a run that calls one waits for the user. */
export const CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "ask_user",
  ...Object.keys(PICTURE_TOOLS),
]);
