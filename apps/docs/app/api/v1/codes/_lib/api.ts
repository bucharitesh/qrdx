import "server-only";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import type { NextRequest } from "next/server";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  insufficientKeyScopeError,
  insufficientScopeError,
  invalidApiKeyError,
  invalidTokenError,
  missingTokenError,
  oauthCompatibleError,
} from "@/lib/api-errors";
import { authenticateApiKey } from "@/lib/api-keys/service";
import { API_KEY_PREFIX, isApiKeyFormat } from "@/lib/api-keys/shared";
import { consumeApiQuota } from "@/lib/api-quota";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { nfcLink } from "@/lib/nfc/links";
import { type OAuthScope, validateAccessToken } from "@/lib/oauth";
import { can } from "@/lib/permissions";
import { assertCan } from "@/lib/permissions-server";
import { getPlanForScope } from "@/lib/plans";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { ensureOwnWorkspaceFor } from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";

export type ApiAccess = "read" | "write";

/** OAuth scopes that grant each access level (write implies read). */
const SCOPES_FOR: Record<ApiAccess, string[]> = {
  read: ["codes:read", "codes:write"],
  write: ["codes:write"],
};

const readLimiter = createRateLimiter({ limiter: slidingWindow(120, "60 s") });
const writeLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });
const ipLimiter = createRateLimiter({ limiter: slidingWindow(300, "60 s") });

/** Cookie-authenticated writes must come from our own pages (CSRF). */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {
    // Treated as cross-origin below.
  }
  const allowed = [
    req.headers.get("x-forwarded-host"),
    req.headers.get("host"),
    baseUrl.host,
  ];
  if (!(host && allowed.includes(host))) {
    throw new HttpError(403, "FORBIDDEN", "Cross-origin request rejected.");
  }
}

/** The browser session's scope; signed out, a 401 that says how to authenticate. */
async function sessionScope(req: NextRequest): Promise<ActiveScope> {
  try {
    return await getActiveScope(req.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) throw missingTokenError();
    throw error;
  }
}

export interface ApiCaller {
  scope: ActiveScope;
  /** A session, or a token or key with codes:write (not only codes:read) */
  canWrite: boolean;
}

/** Who a Bearer credential acts as, and its scopes. */
interface BearerCaller {
  kind: "oauth" | "apiKey";
  scope: ActiveScope;
  scopes: string[];
  /** An OAuth token or a key made before workspaces: acts as the person */
  personal: boolean;
}

/** The user's own workspace, as its owner (made now if it's missing). */
async function ownScope(userId: string): Promise<ActiveScope> {
  const own = await ensureOwnWorkspaceFor(userId);
  return { userId, organizationId: own.id, role: own.role };
}

/**
 * An API key (`qrdx_…`, lib/api-keys) acts on its workspace with its
 * creator's current role there; an OAuth access token acts on its user's
 * own workspace (where codes made before workspaces now live), as its
 * owner. Throws the 401 for a bad credential, in the words of the kind of
 * credential it looks like.
 */
async function authenticateBearer(token: string): Promise<BearerCaller> {
  if (isApiKeyFormat(token)) {
    const key = await authenticateApiKey(token);
    if (!key) throw invalidApiKeyError();
    // The audit log names the key that authenticated this request.
    const credential = {
      type: "api_key",
      id: key.keyId,
      name: key.name,
    } as const;
    return {
      kind: "apiKey",
      scope: key.organizationId
        ? {
            userId: key.userId,
            organizationId: key.organizationId,
            role: key.role,
            credential,
          }
        : { ...(await ownScope(key.userId)), credential },
      scopes: key.scopes,
      personal: key.organizationId === null,
    };
  }
  const oauth = await validateAccessToken(token);
  if (oauth) {
    return {
      kind: "oauth",
      scope: {
        ...(await ownScope(oauth.userId)),
        credential: { type: "oauth_app", id: oauth.appId, name: oauth.appName },
      },
      scopes: oauth.scopes,
      personal: true,
    };
  }
  // A truncated or mistyped key reads as a key, not as an OAuth token.
  throw token.startsWith(API_KEY_PREFIX)
    ? invalidApiKeyError()
    : invalidTokenError();
}

function scopeError(bearer: BearerCaller, scope: string): HttpError {
  return bearer.kind === "apiKey"
    ? insufficientKeyScopeError(scope)
    : insufficientScopeError(scope);
}

/**
 * Resolves who is calling: an API key (acts on its workspace, personal or
 * team, with its creator's role), an OAuth bearer token (acts on the user's
 * own workspace) or the browser session (acts on the workspace the request
 * names, else the session's). Applies per-user and per-IP rate limits, then the
 * workspace's daily quota (lib/api-quota), which every authenticated request
 * counts against, key, token or session.
 */
export async function resolveApiCaller(
  req: NextRequest,
  access: ApiAccess,
): Promise<ApiCaller> {
  const authorization = req.headers.get("authorization");
  let caller: ApiCaller;

  if (authorization?.startsWith("Bearer ")) {
    const bearer = await authenticateBearer(authorization.slice(7).trim());
    if (!SCOPES_FOR[access].some((s) => bearer.scopes.includes(s))) {
      throw scopeError(bearer, `codes:${access}`);
    }
    caller = {
      scope: bearer.scope,
      canWrite:
        SCOPES_FOR.write.some((s) => bearer.scopes.includes(s)) &&
        can(bearer.scope.role, "content.write"),
    };
  } else {
    if (access === "write") assertSameOrigin(req);
    const scope = await sessionScope(req);
    caller = { scope, canWrite: can(scope.role, "content.write") };
  }
  // A key or session of a viewer or billing member reads only: their role in
  // the workspace caps what any credential can do (lib/permissions.ts).
  if (access === "write") assertCan(caller.scope, "content.write");

  // The plan lookup overlaps the per-minute checks; only requests they let
  // through use up the daily quota.
  const [plan] = await Promise.all([
    getPlanForScope(caller.scope),
    enforceRateLimits([
      {
        limiter: access === "write" ? writeLimiter : readLimiter,
        key: `api:codes:${access}:user:${caller.scope.userId}`,
      },
      { limiter: ipLimiter, key: `api:codes:ip:${getClientIp(req)}` },
    ]),
  ]);
  await consumeApiQuota(req, caller.scope, plan);
  return caller;
}

/** The 401 for a keyed feature called without an API key. */
export function apiKeyRequiredError(feature: string): HttpError {
  return new HttpError(
    401,
    "UNAUTHORIZED",
    `${feature} needs a QRdx API key: send it as Authorization: Bearer qrdx_… (create one in Settings → API keys & apps).`,
    { "WWW-Authenticate": 'Bearer realm="QRdx API"' },
    `${baseUrl.origin}/docs/developers/api-keys`,
  );
}

/**
 * The API key on a public endpoint's optional keyed feature (a logo by file
 * id on GET /v1/qr, the MCP save_template tool): its workspace and scopes,
 * after the per-minute limits and the daily quota. Null when no
 * Authorization header is sent; throws the 401 for anything but a valid
 * `qrdx_…` key, and the 403 when `access` is "write" and the key is read-only.
 */
export async function optionalApiKeyCaller(
  req: Request,
  access: ApiAccess,
  feature: string,
): Promise<{ scope: ActiveScope; scopes: string[] } | null> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return null;
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!isApiKeyFormat(token)) {
    throw token.startsWith(API_KEY_PREFIX)
      ? invalidApiKeyError()
      : apiKeyRequiredError(feature);
  }
  const bearer = await authenticateBearer(token);
  if (!SCOPES_FOR[access].some((s) => bearer.scopes.includes(s))) {
    throw scopeError(bearer, `codes:${access}`);
  }
  if (access === "write") assertCan(bearer.scope, "content.write");
  const [plan] = await Promise.all([
    getPlanForScope(bearer.scope),
    enforceRateLimits([
      {
        limiter: access === "write" ? writeLimiter : readLimiter,
        key: `api:codes:${access}:user:${bearer.scope.userId}`,
      },
      { limiter: ipLimiter, key: `api:codes:ip:${getClientIp(req)}` },
    ]),
  ]);
  await consumeApiQuota(req, bearer.scope, plan);
  return { scope: bearer.scope, scopes: bearer.scopes };
}

/** resolveApiCaller's scope. */
export async function resolveApiScope(
  req: NextRequest,
  access: ApiAccess,
): Promise<ActiveScope> {
  return (await resolveApiCaller(req, access)).scope;
}

interface ApiToken {
  userId: string;
  scopes: string[];
  /**
   * The team of a team API key; null for OAuth tokens and personal keys,
   * which act on the user's own workspace.
   */
  organizationId: string | null;
}

/**
 * Bearer auth (API key or OAuth token) for the endpoints that take no browser
 * session (/v1/me, /v1/themes), plus the daily quota of the key's workspace
 * or the token owner's own workspace. Errors carry the API shape and the
 * OAuth fields these endpoints always sent (lib/api-errors
 * oauthCompatibleError).
 */
export async function requireApiToken(
  req: NextRequest,
  requiredScope: OAuthScope,
): Promise<
  | { tokenData: ApiToken; error?: never }
  | { error: Response; tokenData?: never }
> {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return {
      error: oauthCompatibleError("invalid_token", missingTokenError()),
    };
  }
  let bearer: BearerCaller;
  try {
    bearer = await authenticateBearer(authorization.slice(7).trim());
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { error: oauthCompatibleError("invalid_token", error) };
  }
  if (!bearer.scopes.includes(requiredScope)) {
    return {
      error: oauthCompatibleError(
        "insufficient_scope",
        scopeError(bearer, requiredScope),
      ),
    };
  }

  const tokenData: ApiToken = {
    userId: bearer.scope.userId,
    scopes: bearer.scopes,
    organizationId: bearer.personal ? null : bearer.scope.organizationId,
  };
  const scope = bearer.scope;
  try {
    await consumeApiQuota(req, scope, await getPlanForScope(scope));
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return { error: oauthCompatibleError("rate_limited", error) };
  }
  return { tokenData };
}

/** Mutations take JSON only (also keeps simple cross-site form posts out). */
export function assertJson(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send a JSON body with Content-Type: application/json.",
    );
  }
}

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Public JSON shape of a dynamic code. */
export function serializeCode(code: QrCodeView) {
  return {
    id: code.id,
    slug: code.slug,
    shortLink: code.shortLink,
    defaultShortLink: code.defaultShortLink,
    // NFC (feat/nfc): the short link with ?nfc, for NFC tags (lib/nfc/links.ts)
    nfcLink: nfcLink(code.shortLink),
    domain: code.domain
      ? {
          id: code.domain.id,
          hostname: code.domain.hostname,
          verified: code.domain.verified,
        }
      : null,
    destinationUrl: code.destinationUrl,
    title: code.title,
    contentType: code.contentType,
    status: code.status,
    style: code.style,
    scanCount: code.scanCount,
    lastScannedAt: code.lastScannedAt?.toISOString() ?? null,
    archivedAt: code.archivedAt?.toISOString() ?? null,
    createdAt: code.createdAt.toISOString(),
    updatedAt: code.updatedAt.toISOString(),
    organizationId: code.organizationId,
  };
}

export const NO_STORE = { "Cache-Control": "no-store" };
