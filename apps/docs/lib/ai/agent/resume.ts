import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import type { ChatMessage } from "@/types/ai";

// A run that stops for the user (a question to answer, a change to approve)
// is resumed by a second request. That request continues the same AI
// request, so it shouldn't use another one of the user's AI requests. The
// server signs a resume token when the run pauses; a continuation carrying a
// valid token for this user and this conversation isn't counted again.
// Without a valid token it is counted like any new request, so a client
// can't get free runs by sending made-up continuations.

/** How long a paused run can be resumed without counting a new request. */
export const RESUME_TTL_MS = 30 * 60 * 1000;

function secret(label: string): Buffer {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`qrdx:ai-agent:${label}`)
    .digest();
}

/** Key for AI SDK tool approval signatures (experimental_toolApprovalSecret). */
export function toolApprovalSecret(): Uint8Array {
  return new Uint8Array(secret("tool-approval"));
}

/** The user's side of the conversation: what a token is bound to. */
function conversationDigest(
  messages: Pick<ChatMessage, "role" | "parts" | "metadata">[],
) {
  const hash = createHash("sha256");
  for (const message of messages) {
    if (message.role !== "user") continue;
    hash.update(
      JSON.stringify({
        promptData: message.metadata?.promptData ?? null,
        text: message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
      }),
    );
    hash.update("\n");
  }
  return hash.digest("base64url");
}

function sign(userId: string, expires: number, digest: string): string {
  return createHmac("sha256", secret("resume"))
    .update(`${userId}.${expires}.${digest}`)
    .digest("base64url");
}

export function createResumeToken(
  userId: string,
  messages: Pick<ChatMessage, "role" | "parts" | "metadata">[],
  now = Date.now(),
): string {
  const expires = now + RESUME_TTL_MS;
  return `${expires}.${sign(userId, expires, conversationDigest(messages))}`;
}

export function verifyResumeToken(
  token: unknown,
  userId: string,
  messages: Pick<ChatMessage, "role" | "parts" | "metadata">[],
  now = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!(signature && Number.isFinite(expires)) || expires < now) return false;
  const expected = Buffer.from(
    sign(userId, expires, conversationDigest(messages)),
  );
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
