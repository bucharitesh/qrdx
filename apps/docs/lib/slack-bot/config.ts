import "server-only";

import {
  createRateLimiter,
  type RateLimiter,
  slidingWindow,
} from "@repo/rate-limit";
import { env } from "@/lib/env";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { baseUrl } from "@/lib/metadata";
import { enforceRateLimits } from "@/lib/request-guards";
import { verifySlackSignature } from "./signature";

// The bot is one Slack app with the "Add to Slack" alerts: the same client
// id and secret, plus the signing secret for the requests Slack sends.
// Without all of them (and, in production, the encryption key for bot
// tokens) every bot route answers 404 and nothing touches its tables
// (lib/feature-availability-rules.ts, slackBot).

const BOT_CALLBACK_PATH = "/api/integrations/slack/bot/callback";
export const LINK_PAGE_PATH = "/integrations/slack/link";
export const SETTINGS_PATH = "/settings/integrations/slack";

export function isSlackBotEnabled(): boolean {
  return isFeatureAvailable("slackBot");
}

/** The app's credentials; null when the bot isn't configured here. */
export function slackAppCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  if (
    !(isSlackBotEnabled() && env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET)
  ) {
    return null;
  }
  return {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
  };
}

export const absoluteUrl = (path: string) => new URL(path, baseUrl).toString();

/**
 * Where Slack sends the browser back after "Add the bot to Slack", on the
 * same origin as the alerts flow's callback (getIntegrationRedirectUri).
 */
export function botRedirectUri(): string {
  return absoluteUrl(BOT_CALLBACK_PATH);
}

/** BETTER_AUTH_SECRET, which link tokens' key is derived from. */
export function linkTokenSecret(): string | null {
  return process.env.BETTER_AUTH_SECRET || null;
}

/** Slack's requests are small; anything bigger isn't one. */
const MAX_BODY_BYTES = 512 * 1024;

const notFound = () => new Response("Not found", { status: 404 });

async function readRawBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The raw body of a request from Slack, once its signature checks out
 * (before anything in it is parsed or acted on), or the response to send:
 * 404 when the bot isn't configured here, 413 for an oversized body, 401
 * for a missing, stale or wrong signature.
 */
export async function readSlackRequest(
  request: Request,
  now: number = Date.now(),
): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  const secret = env.SLACK_SIGNING_SECRET;
  if (!(isSlackBotEnabled() && secret)) {
    return { ok: false, response: notFound() };
  }
  const body = await readRawBody(request);
  if (body === null) {
    return {
      ok: false,
      response: new Response("Payload too large", { status: 413 }),
    };
  }
  const check = verifySlackSignature({
    secret,
    rawBody: body,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    now,
  });
  if (!check.ok) {
    return {
      ok: false,
      response: new Response("Invalid signature", { status: 401 }),
    };
  }
  return { ok: true, body };
}

// Per Slack person and per Slack workspace: generous for people, a ceiling
// for a script hammering one workspace's bot. Anyone can add the bot to any
// number of Slack workspaces, so one more window spans them all: past it,
// the bot answers that it's busy instead of working. Tracked codes write
// to the database and have a lower one of their own.
const personLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:user",
  limiter: slidingWindow(30, "60 s"),
});
const teamLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:team",
  limiter: slidingWindow(300, "60 s"),
});
const allTeamsLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:all",
  limiter: slidingWindow(600, "60 s"),
});
const allTracksLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:all-track",
  limiter: slidingWindow(120, "60 s"),
});

/** Over a person's or workspace's limit. */
export const SLOW_DOWN_TEXT =
  "You're going a little fast. Wait a minute and try again.";
/** Over the limit across every Slack workspace. */
export const BUSY_TEXT = "QRdx is busy right now. Try again in a minute.";

async function within(limiter: RateLimiter, key: string): Promise<boolean> {
  try {
    await enforceRateLimits([{ limiter, key }]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the bot answers this request: "slow" when this Slack person or
 * workspace is over its limit, "busy" when the bot is over its limit across
 * all Slack workspaces, else "ok".
 */
export async function slackLimitFor(
  teamId: string,
  slackUserId: string,
): Promise<"ok" | "slow" | "busy"> {
  try {
    await enforceRateLimits([
      { limiter: personLimiter, key: `${teamId}:${slackUserId}` },
      { limiter: teamLimiter, key: teamId },
    ]);
  } catch {
    return "slow";
  }
  return (await within(allTeamsLimiter, "all")) ? "ok" : "busy";
}

/** False when tracked codes are over their limit across all workspaces. */
export function withinTrackCap(): Promise<boolean> {
  return within(allTracksLimiter, "all");
}
