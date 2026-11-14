import { z } from "zod";
import type { FormAnswer } from "@/lib/landing/blocks/form-fields";
import { formatAnswerValue } from "@/lib/landing/blocks/form-fields";

// The POST /api/forms/<pageId> body sent by the form block (form-client.tsx).

/** Request bodies above this are rejected before parsing (413). */
export const MAX_SUBMISSION_BYTES = 32 * 1024;

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;

export const pageIdParamSchema = z.string().regex(idPattern);

export const submissionSchema = z.object({
  /** Form block id on the page */
  block: z.string().regex(idPattern),
  /** Code the visitor scanned (render context); verified server-side */
  qrCodeId: z.string().regex(idPattern).nullish(),
  /** Answers keyed by field id; validated against the block's fields */
  answers: z.record(z.string().max(64), z.unknown()),
  /** Turnstile token, when the site has Turnstile keys */
  token: z.string().max(4096).nullish(),
  /** Honeypot: people never see it, so anything here means a bot */
  hp: z.string().max(500).optional(),
});

export type Submission = z.infer<typeof submissionSchema>;

/** Answers as event fields for webhooks and notifications (lib/events). */
export function answersToEventFields(answers: FormAnswer[]) {
  return answers.map((answer) => ({
    name: answer.id,
    label: answer.label,
    value: formatAnswerValue(answer),
  }));
}
