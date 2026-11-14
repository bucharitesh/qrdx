// Every error code the REST API (/v1) can return, with its status, what it
// means and how to fix it. The OpenAPI document (lib/openapi/document.ts)
// describes each operation's error responses from this list, and
// content/docs/developers/errors.mdx documents it; tests/api/openapi.test.ts
// keeps all three in step with the codes thrown in the route code.

import { MAX_CODES_PER_REQUEST } from "@repo/config";
import { ART_TEXT_MAX_LENGTH } from "@/components/sections/ai-art/config";
import { AI_ART_DAILY_LIMIT } from "@/lib/ai/art";
import { formatCount } from "@/lib/format-count";

export interface ApiErrorInfo {
  /** The `code` field of the error body */
  code: string;
  status: number;
  /** What happened, in a sentence */
  meaning: string;
  /** What the caller should do */
  fix: string;
}

export const API_ERRORS = [
  {
    code: "VALIDATION_ERROR",
    status: 400,
    meaning:
      "The body, query or path failed validation. `data.details` lists each problem as `{ path, message }` (`{ param, message }` on the image API), with the row's `index` when the body is an array of codes.",
    fix: "Correct the fields listed in `data.details` and send the request again.",
  },
  {
    code: "INVALID_SLUG",
    status: 400,
    meaning:
      "The custom back-half (`slug`) breaks a rule: a reserved word, or the same back-half twice in one request. For an array, `data.details` lists each row by `index`.",
    fix: "Choose another back-half. The message names the rule.",
  },
  {
    code: "TOO_MANY_CODES",
    status: 400,
    meaning: `More than ${formatCount(MAX_CODES_PER_REQUEST)} codes in one request. The body schema normally rejects this first, as \`VALIDATION_ERROR\`.`,
    fix: `Send at most ${formatCount(MAX_CODES_PER_REQUEST)} codes per request.`,
  },
  {
    code: "DOMAIN_NOT_VERIFIED",
    status: 400,
    meaning: "`domainId` points to a custom domain that isn't verified yet.",
    fix: "Finish verifying the domain on the Domains page, or leave `domainId` out.",
  },
  {
    code: "SID_REQUIRED",
    status: 400,
    meaning:
      "A conversion without the `qrdx_sid` of the scan (from the browser), or without `sid` or `code` (from a server).",
    fix: "Send the `qrdx_sid` the short link added to your page URL, or, with an API key or token, the code id as `code`.",
  },
  {
    code: "AI_ART_TEXT_TOO_LONG",
    status: 400,
    meaning: `\`text\` is too long for AI art (more than ${ART_TEXT_MAX_LENGTH} characters).`,
    fix: "Send a dynamic code's id as `code` instead: the art encodes its short link, which is short and stays editable.",
  },
  {
    code: "UNAUTHORIZED",
    status: 401,
    meaning:
      "No credentials: the request has no `Authorization: Bearer` header (and no QRdx browser session).",
    fix: "Send an API key as `Authorization: Bearer <key>`; create one in Settings → API keys & apps. OAuth access tokens go in the same header.",
  },
  {
    code: "INVALID_TOKEN",
    status: 401,
    meaning:
      "The API key or access token is unknown, revoked or expired (access tokens last one hour), or the key's creator was banned or left the key's workspace.",
    fix: "Check that you sent the whole key, or create a new one. For an access token, get a new one with your refresh token, or send the user through authorization again.",
  },
  {
    code: "PLAN_REQUIRED",
    status: 402,
    meaning:
      "The feature isn't on the workspace's plan: bulk creation, custom back-halves and custom domains need Pro; conversions and hooks need Business.",
    fix: "Upgrade the workspace, or leave the feature out of the request.",
  },
  {
    code: "LIMIT_REACHED",
    status: 402,
    meaning:
      "The workspace has as many active dynamic codes as its plan includes (10 on Free).",
    fix: "Archive a code (archived codes don't count) or upgrade to Pro for unlimited codes.",
  },
  {
    code: "AI_ART_CREDITS_EXHAUSTED",
    status: 402,
    meaning:
      "The workspace has used this month's AI art images (Free and Pro). Nothing was charged for the request.",
    fix: "Wait for the allowance to reset on the 1st of the month (UTC), or upgrade for more images.",
  },
  {
    code: "INSUFFICIENT_SCOPE",
    status: 403,
    meaning:
      "The API key or token is valid but lacks the scope this endpoint needs.",
    fix: "Create a key with the scope named in the message (a key's scopes can't be changed). For an OAuth app, add the scope and ask for it when the user authorizes.",
  },
  {
    code: "FORBIDDEN",
    status: 403,
    meaning:
      "The caller may not do this: a workspace member deleting a code someone else created, a member managing hooks, or a browser-session write from another site. An API key can do only what its creator's role in its workspace allows.",
    fix: "Ask a workspace owner or admin, or call the API with an API key from your server.",
  },
  {
    code: "CONFIRMATION_REQUIRED",
    status: 403,
    meaning:
      "Creating a hook with a signed-in browser session needs a recent \"Confirm it's you\". API keys and OAuth tokens aren't asked.",
    fix: "Confirm it's you in QRdx, then try again within 10 minutes, or create the hook with an API key from your server.",
  },
  {
    code: "CONVERSIONS_OFF",
    status: 403,
    meaning:
      "A browser conversion for a code that doesn't have conversion tracking turned on.",
    fix: "Turn on conversion tracking for the code, or report the conversion from your server with an API key.",
  },
  {
    code: "LIMIT_REACHED",
    status: 403,
    meaning: "The workspace already has 20 webhook endpoints and hooks.",
    fix: "Delete an endpoint or hook you no longer use.",
  },
  {
    code: "NOT_FOUND",
    status: 404,
    meaning:
      "No such endpoint, or the code, hook, theme or custom domain doesn't exist in the workspace the key or token acts on.",
    fix: "Check the path and the id. An API key acts on the workspace it was created in; an OAuth token acts on its user's own workspace.",
  },
  {
    code: "INVALID_SID",
    status: 404,
    meaning:
      "The `qrdx_sid` is unknown or older than 30 days, the attribution window.",
    fix: "Send the `qrdx_sid` of a recent scan, or report the conversion by code id from your server.",
  },
  {
    code: "SLUG_TAKEN",
    status: 409,
    meaning:
      "Another code already uses that back-half on that domain. For an array, `data.details` lists each taken one by `index`, and nothing is created.",
    fix: "Choose another back-half.",
  },
  {
    code: "PAYLOAD_TOO_LARGE",
    status: 413,
    meaning:
      "The body is over the endpoint's limit: 4 MB for codes, 16 KB for hooks, 8 KB for conversions. Also a batch of codes whose response (each code with its design) would be over 4 MB; nothing is created.",
    fix: "Send a smaller body. For codes, a large inline logo is the usual cause; for a batch, send `Prefer: return=minimal` or fewer codes.",
  },
  {
    code: "AI_ART_IMAGE_TOO_LARGE",
    status: 413,
    meaning:
      "The `photo` or `reference` image is over the AI art size limit (the message says which).",
    fix: "Downsize the image (a `reference` to about 512 px on its longest side, a `photo` to about 1024 px square) and send it again as a PNG or JPEG data URL.",
  },
  {
    code: "UNSUPPORTED_MEDIA_TYPE",
    status: 415,
    meaning: "A write without `Content-Type: application/json`.",
    fix: "Send a JSON body with `Content-Type: application/json`.",
  },
  {
    code: "UNSAFE_DESTINATION",
    status: 422,
    meaning:
      "Google Web Risk flags the destination URL (malware, phishing or unwanted software). For an array, `data.details` lists each flagged row by `index`, and nothing is created.",
    fix: "Use another destination. If the flag is wrong, ask Google to review the site.",
  },
  {
    code: "RATE_LIMITED",
    status: 429,
    meaning:
      "Too many requests: a per-minute limit (only `Retry-After` is set) or the workspace's daily quota (`Retry-After` plus `X-RateLimit-*`).",
    fix: "Wait `Retry-After` seconds. For the daily quota, wait for 00:00 UTC or upgrade the plan.",
  },
  {
    code: "AI_ART_CREDITS_EXHAUSTED",
    status: 429,
    meaning:
      "A Business workspace has used this month's AI art images, which the whole team shares.",
    fix: "Wait for the allowance to reset on the 1st of the month (UTC).",
  },
  {
    code: "AI_ART_DAILY_LIMIT",
    status: 429,
    meaning: `The key's creator has made ${AI_ART_DAILY_LIMIT} AI art images today (UTC), a safety cap on top of the monthly allowance.`,
    fix: "Try again tomorrow (UTC).",
  },
  {
    code: "INTERNAL_ERROR",
    status: 500,
    meaning: "Something failed on QRdx's side. It has been logged.",
    fix: "Try again in a moment. If it keeps happening, report it with the time of the request.",
  },
  {
    code: "AI_ART_FAILED",
    status: 502,
    meaning:
      "The image model failed, declined the prompt or returned an image QRdx couldn't read. No AI art credit was used.",
    fix: "Try again, or reword the prompt. The message says what happened.",
  },
  {
    code: "AI_ART_UNSCANNABLE",
    status: 502,
    meaning:
      "The model's image couldn't be made to scan within the QR visibility you chose. No AI art credit was used.",
    fix: "Try again with a higher `visibility`, or another seed.",
  },
  {
    code: "AI_ART_DESCRIBE_FAILED",
    status: 502,
    meaning:
      "You left out `prompt`, and the text model that writes one for you failed. No AI art credit was used.",
    fix: "Try again, or send your own `prompt`.",
  },
  {
    code: "SLUG_UNAVAILABLE",
    status: 503,
    meaning: "No free short-link slug could be reserved in time.",
    fix: "Send the same request again.",
  },
  {
    code: "AI_ART_BUSY",
    status: 503,
    meaning:
      "The image model is over capacity right now. No AI art credit was used.",
    fix: "Wait a minute and try again.",
  },
  {
    code: "AI_NOT_CONFIGURED",
    status: 503,
    meaning:
      "AI art isn't set up on this deployment (a self-hosted instance without `AI_GATEWAY_API_KEY`).",
    fix: "Use the hosted QRdx API, or set up Vercel AI Gateway on your instance.",
  },
  {
    code: "UNAVAILABLE",
    status: 503,
    meaning:
      "Custom domains aren't set up on this deployment (a self-hosted instance without them).",
    fix: "Leave `domainId` out, or configure custom domains on your instance.",
  },
  {
    code: "AI_ART_TIMEOUT",
    status: 504,
    meaning:
      "The image model took too long, and QRdx stopped waiting before the request's one-minute limit. No AI art credit was used.",
    fix: "Try again. Calls usually take 15 to 45 seconds.",
  },
] as const satisfies readonly ApiErrorInfo[];

export type ApiErrorCode = (typeof API_ERRORS)[number]["code"];

/** The catalogue entries with a given code (some codes have two statuses). */
export function apiErrorsWithCode(code: ApiErrorCode): ApiErrorInfo[] {
  return API_ERRORS.filter((error) => error.code === code);
}

/** The values of `error` on /v1/me and /v1/themes, next to `code`. */
export const OAUTH_COMPATIBLE_ERRORS = {
  invalid_token: "UNAUTHORIZED or INVALID_TOKEN",
  insufficient_scope: "INSUFFICIENT_SCOPE",
  rate_limited: "RATE_LIMITED (daily quota)",
  not_found: "NOT_FOUND (themes)",
} as const;
