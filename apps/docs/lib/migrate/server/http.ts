import "server-only";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import type { z } from "zod";
import { HttpError, handleError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import {
  enforceRateLimits,
  getClientIp,
  parseWithSchema,
  readJsonBody,
} from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { ImportError, type ImporterDeps } from "../importer";
import { dbRepo } from "./repo";

export const NO_STORE = { "Cache-Control": "no-store" };
/** 1,000 links with long URLs fit comfortably. */
export const MAX_BODY_BYTES = 1024 * 1024;

const readLimiter = createRateLimiter({
  limiter: slidingWindow(120, "60 s"),
  prefix: "qrdx:migrate:read",
});
const writeLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
  prefix: "qrdx:migrate:write",
});
const ipLimiter = createRateLimiter({
  limiter: slidingWindow(240, "60 s"),
  prefix: "qrdx:migrate:ip",
});

export const deps: ImporterDeps = {
  repo: dbRepo,
  now: () => new Date(),
  newId: () => cuid(),
};

/** Import calls come from our own dashboard only (cookie auth). */
function assertSameOrigin(req: Request) {
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

/**
 * The session's workspace (never from the client), rate limited per user and
 * IP. Imports always land in the active personal or team workspace.
 */
export async function migrateScope(
  req: Request,
  { write = false }: { write?: boolean } = {},
): Promise<ActiveScope> {
  if (write) assertSameOrigin(req);
  const scope = await getActiveScope(req.headers);
  await enforceRateLimits([
    {
      limiter: write ? writeLimiter : readLimiter,
      key: `migrate:user:${scope.userId}`,
    },
    { limiter: ipLimiter, key: `migrate:ip:${getClientIp(req)}` },
  ]);
  return scope;
}

export async function readBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  }
  return parseWithSchema(schema, await readJsonBody(req, MAX_BODY_BYTES));
}

/** JSON success, or the error as `{ code, message }` with its status. */
export async function respond(
  route: string,
  fn: () => Promise<unknown>,
): Promise<Response> {
  try {
    return Response.json({ data: await fn() }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ImportError) {
      return Response.json(
        { code: error.code, message: error.message, status: error.status },
        { status: error.status, headers: { ...NO_STORE, ...error.headers } },
      );
    }
    // Context is the route only: never links, destinations or tokens.
    return handleError(error, { route });
  }
}
