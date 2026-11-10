import "server-only";

import type { MessageData } from "./interactions";

// After a "thinking" response (a styled code, or a pick in a code's style
// menus), the message itself goes to the interaction's own webhook: Edit
// Original Interaction Response. It needs the app's id and the
// interaction's token, which works for 15 minutes; no bot token. Only
// discord.com is ever called, and the token is never logged.
// https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response

const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 8000;

/** Discord's interaction tokens: letters, digits, dots, dashes, underscores. */
const TOKEN = /^[A-Za-z0-9._-]{20,600}$/;
const APPLICATION_ID = /^\d{1,25}$/;

/** True when the interaction carries a token the follow-up can use. */
export const isInteractionToken = (token: unknown): token is string =>
  typeof token === "string" && TOKEN.test(token);

/**
 * Replaces "thinking" (or the message a menu is on) with `data`. Visibility
 * was set by the deferred response, so `flags` isn't sent. False when
 * Discord refused it or couldn't be reached; the status is logged, nothing
 * else.
 */
export async function editOriginalResponse(
  applicationId: string,
  token: string,
  data: MessageData,
): Promise<boolean> {
  if (!(APPLICATION_ID.test(applicationId) && isInteractionToken(token))) {
    return false;
  }
  const { flags: _flags, ...body } = data;
  let status: number | string;
  try {
    const response = await fetch(
      `${API}/webhooks/${applicationId}/${token}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (response.ok) return true;
    status = response.status;
  } catch (error) {
    // The error would name the URL, which holds the token.
    status = error instanceof Error ? error.name : "unknown";
  }
  console.error(JSON.stringify({ event: "discord-bot.edit_failed", status }));
  return false;
}
