"use server";

import { database as db, qrCode } from "@repo/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  lastRedirectDestination,
  rememberedPages,
  switchCodeKind,
} from "@/app/dashboard/codes/_lib/code-kind";
import { inactiveOptions } from "@/app/dashboard/codes/_lib/code-kind-shared";
import type {
  CodeKind,
  CodeOptionId,
} from "@/app/dashboard/codes/_lib/code-options";
import {
  codeIdSchema,
  destinationUrlSchema,
  enforceCreateRateLimit,
  getCode,
} from "@/app/dashboard/codes/_lib/qr-codes";
import {
  getPageUsage,
  getScopedPageContent,
  type PageUsage,
  pageForCodeSchema,
  pageIdSchema,
} from "@/app/dashboard/pages/_lib/landing-pages";
import { HttpError } from "@/lib/error-response";
import { getBlock } from "@/lib/landing/blocks";
import { getTemplate } from "@/lib/landing/templates";
import { assertCan } from "@/lib/permissions-server";
import {
  parsePixelConfig,
  parseRoutingConfig,
  parseUtmConfig,
} from "@/lib/redirect/routing";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

// The code page's "Change type" dialog and the switch editor
// (codes/[id]/change-type): what a code can switch to, and the switch.

export type CodeKindErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSAFE_DESTINATION"
  | "UNKNOWN_ERROR";

export type CodeKindActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: CodeKindErrorCode; message: string } };

const KNOWN_CODES = new Set<string>([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "LIMIT_REACHED",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSAFE_DESTINATION",
]);

function failure(
  error: unknown,
  context: Record<string, unknown>,
): CodeKindActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to change codes." },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as CodeKindErrorCode)
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }
  logError(error as Error, context);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Invalid input",
    );
  }
  return result.data;
}

/** Every action resolves the caller's scope itself; nothing scope-related comes from the client. */
async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  { revalidate = false } = {},
): Promise<CodeKindActionResult<T>> {
  try {
    const data = await fn(await getActiveScope());
    if (revalidate) revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, { action });
  }
}

export interface CodeTypePage {
  id: string;
  title: string | null;
  typeLabel: string;
}

export interface CodeTypeOptions {
  kind: CodeKind;
  /** The page the code opens now; null for website links and deleted pages */
  page: (CodeTypePage & { blocks: { type: string; label: string }[] }) | null;
  /** Pages it opened before that still exist (switch back) */
  previousPages: CodeTypePage[];
  /** Its destination the last time it was a website link */
  lastDestination: string | null;
  pageUsage: PageUsage;
  /** Options set up on the code that the other type doesn't use */
  inactiveAfterSwitch: CodeOptionId[];
}

const typeLabel = (type: string) => getTemplate(type)?.label ?? "Page";

export async function getCodeTypeOptions(input: {
  id: string;
}): Promise<CodeKindActionResult<CodeTypeOptions>> {
  return run("getCodeTypeOptions", async (scope) => {
    assertCan(scope, "content.write");
    const code = await getCode(scope, parse(codeIdSchema, input?.id));
    const kind: CodeKind = code.kind === "page" ? "page" : "redirect";
    const [current, previous, lastDestination, pageUsage, [settings]] =
      await Promise.all([
        kind === "page" && code.pageId
          ? getScopedPageContent(scope, code.pageId)
          : null,
        rememberedPages(scope, code),
        kind === "page" ? lastRedirectDestination(code.id) : null,
        getPageUsage(scope),
        db
          .select({
            routing: qrCode.routing,
            utm: qrCode.utm,
            pixels: qrCode.pixels,
          })
          .from(qrCode)
          .where(eq(qrCode.id, code.id))
          .limit(1),
      ]);
    return {
      kind,
      page:
        current && code.pageId
          ? {
              id: code.pageId,
              title: current.title,
              typeLabel: typeLabel(current.type),
              blocks: current.content.blocks.map((block) => ({
                type: block.type,
                label: getBlock(block.type)?.label ?? "Block",
              })),
            }
          : null,
      previousPages: previous.map((page) => ({
        id: page.id,
        title: page.title,
        typeLabel: typeLabel(page.type),
      })),
      lastDestination,
      pageUsage,
      inactiveAfterSwitch: inactiveOptions(
        kind === "page" ? "redirect" : "page",
        settings
          ? {
              routing: parseRoutingConfig(settings.routing),
              utm: parseUtmConfig(settings.utm),
              pixels: parsePixelConfig(settings.pixels),
            }
          : null,
      ),
    };
  });
}

const switchSchema = z.discriminatedUnion("kind", [
  z.object({
    id: codeIdSchema,
    kind: z.literal("redirect"),
    destinationUrl: destinationUrlSchema,
  }),
  z.object({ id: codeIdSchema, kind: z.literal("page"), pageId: pageIdSchema }),
]);

/** To a website link, or back to a page the workspace has. */
export async function switchQrCodeKind(
  input: z.input<typeof switchSchema>,
): Promise<CodeKindActionResult<{ id: string; kind: CodeKind }>> {
  return run(
    "switchQrCodeKind",
    async (scope) => {
      const { id, ...change } = parse(switchSchema, input);
      const code = await switchCodeKind(scope, id, change);
      return { id: code.id, kind: code.kind };
    },
    { revalidate: true },
  );
}

const publishSchema = pageForCodeSchema.extend({ codeId: codeIdSchema });

/**
 * Publish in the switch editor: makes the page (counted toward the plan's
 * hosted pages) and points the code at it, in one step. Scans keep their
 * old destination until this succeeds.
 */
export async function publishCodeSwitchPage(
  input: z.input<typeof publishSchema>,
): Promise<CodeKindActionResult<{ codeId: string; pageId: string | null }>> {
  return run(
    "publishCodeSwitchPage",
    async (scope) => {
      const { codeId, ...page } = parse(publishSchema, input);
      await enforceCreateRateLimit(scope.userId);
      const code = await switchCodeKind(scope, codeId, { kind: "page", page });
      return { codeId: code.id, pageId: code.pageId };
    },
    { revalidate: true },
  );
}
