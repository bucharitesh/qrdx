import { z } from "zod";
import {
  connectLimiter,
  providerReadLimiter,
} from "@/lib/connected-accounts/server";
import {
  dataErrorResponse,
  jsonError,
  requireUser,
} from "@/lib/data-connections/http";
import {
  getSinkView,
  retrySync,
  saveResponseSink,
  setSheetSync,
} from "@/lib/data-connections/settings";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ provider: string }> };

const SINKS = new Set(["google-sheets", "hubspot", "mailchimp"]);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const target = z.string().regex(/^[A-Za-z0-9_]{0,64}$/);
const formsSchema = z
  .record(
    z.string().regex(/^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/),
    z.object({
      fields: z
        .record(id, target)
        .refine((value) => Object.keys(value).length <= 60, "Too many fields"),
      consentFieldId: id.nullable().optional(),
    }),
  )
  .refine((value) => Object.keys(value).length <= 200, "Too many forms");

const responseSinkSchema = z.object({
  enabled: z.boolean(),
  pageIds: z.array(id).max(200).nullable(),
  forms: formsSchema,
  audienceId: z
    .string()
    .regex(/^[A-Za-z0-9]{1,32}$/)
    .optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  withoutConsent: z.enum(["pending", "skip"]).optional(),
});

const sheetSyncSchema = z.object({ enabled: z.boolean() });
const actionSchema = z.object({ action: z.literal("retry") });

async function guard(provider: string, write: boolean) {
  if (!SINKS.has(provider)) {
    return {
      response: jsonError(404, "NOT_FOUND", "Not a data-out integration."),
    };
  }
  return requireUser(
    write ? connectLimiter : providerReadLimiter,
    `integrations:sync:${provider}`,
  );
}

/** GET — stream state, settings and the workspace's form pages (no tokens). */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const user = await guard(provider, false);
  if ("response" in user) return user.response;
  try {
    const scope = await getActiveScope(request.headers);
    const view = await getSinkView(scope, provider);
    if (!view)
      return jsonError(404, "NOT_CONNECTED", "Connect the account first.");
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "view",
    });
  }
}

/** PUT — save settings and turn the stream on or off. */
export async function PUT(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const user = await guard(provider, true);
  if ("response" in user) return user.response;
  try {
    const body = await readJsonBody(request, 64 * 1024);
    const scope = await getActiveScope(request.headers);
    if (provider === "google-sheets") {
      await setSheetSync(scope, parseWithSchema(sheetSyncSchema, body).enabled);
    } else {
      await saveResponseSink(
        scope,
        provider as "hubspot" | "mailchimp",
        parseWithSchema(responseSinkSchema, body),
      );
    }
    return Response.json(await getSinkView(scope, provider));
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "save",
    });
  }
}

/** POST {action:"retry"} — clear a failure and sync now. */
export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const user = await guard(provider, true);
  if ("response" in user) return user.response;
  try {
    parseWithSchema(actionSchema, await readJsonBody(request, 1024));
    const summary = await retrySync(user.userId, provider);
    const scope = await getActiveScope(request.headers);
    return Response.json({ summary, view: await getSinkView(scope, provider) });
  } catch (error) {
    return dataErrorResponse(error, {
      userId: user.userId,
      provider,
      action: "retry",
    });
  }
}
