import "server-only";

import type { SlackMessage } from "./messages";

// The few Slack Web API calls the bot makes: finishing the install
// (oauth.v2.access), Sign in with Slack when linking an account
// (openid.connect.token, openid.connect.userInfo), replying
// (chat.postMessage, chat.postEphemeral) and answering through a slash
// command's or shortcut's response_url. Slack
// answers HTTP 200 with `ok: false` for most errors; those come back as
// { ok: false, error } and are never thrown. Tokens and message text are
// never logged.

const SLACK_API = "https://slack.com/api";
const TIMEOUT_MS = 8000;

/** The bot scopes "Add the bot to Slack" asks for, nothing more. */
export const SLACK_BOT_SCOPES = [
  "commands",
  "app_mentions:read",
  "chat:write",
  "im:history",
] as const;

export type SlackFailure = { ok: false; error: string };
export type SlackResult = { ok: true } | SlackFailure;

async function slackCall(
  method: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${SLACK_API}/${method}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return { ok: false, error: `http_${response.status}` };
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "invalid_response" };
  }
}

const slackError = (data: Record<string, unknown>) =>
  String(data.error ?? "unknown_error").slice(0, 60);

export interface SlackBotInstall {
  teamId: string;
  teamName: string | null;
  enterpriseId: string | null;
  botUserId: string;
  botToken: string;
  scopes: string | null;
}

/**
 * Exchanges the install's code for the bot token. Refuses org-wide
 * Enterprise Grid installs (the bot is added per workspace) and anything
 * that isn't a bot token.
 */
export async function exchangeBotCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: true; install: SlackBotInstall } | SlackResult> {
  const data = await slackCall("oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }).toString(),
  });
  return readBotInstall(data);
}

/** oauth.v2.access's answer, checked. */
function readBotInstall(
  data: Record<string, unknown>,
): { ok: true; install: SlackBotInstall } | SlackResult {
  if (data.ok !== true) return { ok: false, error: slackError(data) };
  if (data.is_enterprise_install === true) {
    return { ok: false, error: "enterprise_install" };
  }
  const team = (data.team ?? {}) as { id?: unknown; name?: unknown };
  const enterprise = (data.enterprise ?? null) as { id?: unknown } | null;
  const token = data.access_token;
  const botUserId = data.bot_user_id;
  if (
    data.token_type !== "bot" ||
    typeof token !== "string" ||
    !token.startsWith("xoxb-") ||
    typeof botUserId !== "string" ||
    typeof team.id !== "string"
  ) {
    return { ok: false, error: "invalid_install" };
  }
  return {
    ok: true,
    install: {
      teamId: team.id,
      teamName: typeof team.name === "string" ? team.name.slice(0, 100) : null,
      enterpriseId: typeof enterprise?.id === "string" ? enterprise.id : null,
      botUserId,
      botToken: token,
      scopes: typeof data.scope === "string" ? data.scope.slice(0, 500) : null,
    },
  };
}

/**
 * Sign in with Slack (the link page's identity check): exchanges the code
 * for an access token and the id_token. The access token is only used for
 * openid.connect.userInfo right after; it's never stored or logged.
 */
export async function exchangeOpenIdCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ ok: true; accessToken: string; idToken: string } | SlackFailure> {
  const data = await slackCall("openid.connect.token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (data.ok !== true) return { ok: false, error: slackError(data) };
  const { access_token: accessToken, id_token: idToken } = data;
  if (typeof accessToken !== "string" || typeof idToken !== "string") {
    return { ok: false, error: "invalid_token_response" };
  }
  return { ok: true, accessToken, idToken };
}

/** The signed-in person's claims (openid.connect.userInfo). */
export async function fetchOpenIdUserInfo(
  accessToken: string,
): Promise<{ ok: true; claims: Record<string, unknown> } | SlackFailure> {
  const data = await slackCall("openid.connect.userInfo", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data.ok === true
    ? { ok: true, claims: data }
    : { ok: false, error: slackError(data) };
}

async function postJson(
  method: string,
  token: string,
  body: Record<string, unknown>,
): Promise<SlackResult> {
  const data = await slackCall(method, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return data.ok === true
    ? { ok: true }
    : { ok: false, error: slackError(data) };
}

/** Posts in a channel or DM; in a thread with `threadTs`. */
export function postMessage(
  token: string,
  target: { channel: string; threadTs?: string },
  message: SlackMessage,
): Promise<SlackResult> {
  return postJson("chat.postMessage", token, {
    channel: target.channel,
    ...(target.threadTs && { thread_ts: target.threadTs }),
    text: message.text,
    blocks: message.blocks,
    // Links in the content never unfurl into previews.
    unfurl_links: false,
    unfurl_media: false,
  });
}

/** A message only `user` sees, in a channel (and thread). */
export function postEphemeral(
  token: string,
  target: { channel: string; user: string; threadTs?: string },
  message: SlackMessage,
): Promise<SlackResult> {
  return postJson("chat.postEphemeral", token, {
    channel: target.channel,
    user: target.user,
    ...(target.threadTs && { thread_ts: target.threadTs }),
    text: message.text,
    blocks: message.blocks,
  });
}

/** Slack's response URLs, and nothing else, ever get a POST from here. */
export function isSlackResponseUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "hooks.slack.com" &&
      url.port === "" &&
      !(url.username || url.password)
    );
  } catch {
    return false;
  }
}

/** Answers a slash command or shortcut later, through its response_url. */
export async function postToResponseUrl(
  responseUrl: string,
  message: SlackMessage,
): Promise<SlackResult> {
  if (!isSlackResponseUrl(responseUrl)) {
    return { ok: false, error: "invalid_response_url" };
  }
  const response = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ replace_original: false, ...message }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.ok
    ? { ok: true }
    : { ok: false, error: `http_${response.status}` };
}
