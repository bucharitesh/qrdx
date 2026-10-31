"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type CodeListStatus,
  type CodeUsage,
  codeIdSchema,
  createCodeSchema,
  createCodes,
  deleteCode,
  enforceCreateRateLimit,
  getCode,
  getCodeUsage,
  hasAnyField,
  listCodes,
  type QrCodeView,
  setCodeArchived,
  updateCode,
  updateCodeFields,
  type updateCodeSchema,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { HttpError } from "@/lib/error-response";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

export type QrCodeErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";

export type QrCodeActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: QrCodeErrorCode; message: string } };

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "FORBIDDEN",
  "LIMIT_REACHED",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
]);

function failure(
  error: unknown,
  context: Record<string, unknown>,
): QrCodeActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to manage dynamic QR codes.",
      },
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
          ? (error.code as QrCodeErrorCode)
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
): Promise<QrCodeActionResult<T>> {
  try {
    const data = await fn(await getActiveScope());
    if (revalidate) revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, { action });
  }
}

const listSchema = z
  .object({
    status: z.enum(["active", "archived", "all"]).optional(),
    q: z.string().max(200).optional(),
  })
  .optional();

const updateSchema = updateCodeFields
  .extend({ id: codeIdSchema })
  .transform(({ id, ...patch }) => ({ id, patch }))
  .refine(({ patch }) => hasAnyField(patch), { message: "Nothing to update" });

const archiveSchema = z.object({ id: codeIdSchema, archived: z.boolean() });
const idOnlySchema = z.object({ id: codeIdSchema });

export async function createQrCode(
  input: z.input<typeof createCodeSchema>,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run(
    "createQrCode",
    async (scope) => {
      const data = parse(createCodeSchema, input);
      await enforceCreateRateLimit(scope.userId);
      const [code] = await createCodes(scope, [data]);
      return code;
    },
    { revalidate: true },
  );
}

export async function updateQrCode(
  input: { id: string } & z.input<typeof updateCodeSchema>,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run(
    "updateQrCode",
    (scope) => {
      const { id, patch } = parse(updateSchema, input);
      return updateCode(scope, id, patch);
    },
    { revalidate: true },
  );
}

export async function setQrCodeArchived(
  input: z.input<typeof archiveSchema>,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run(
    "setQrCodeArchived",
    (scope) => {
      const { id, archived } = parse(archiveSchema, input);
      return setCodeArchived(scope, id, archived);
    },
    { revalidate: true },
  );
}

export async function deleteQrCode(
  input: z.input<typeof idOnlySchema>,
): Promise<QrCodeActionResult<{ id: string }>> {
  return run(
    "deleteQrCode",
    (scope) => deleteCode(scope, parse(idOnlySchema, input).id),
    { revalidate: true },
  );
}

export async function listQrCodes(input?: {
  status?: CodeListStatus;
  q?: string;
}): Promise<QrCodeActionResult<{ codes: QrCodeView[]; total: number }>> {
  return run("listQrCodes", (scope) =>
    listCodes(scope, { ...parse(listSchema, input), limit: 100 }),
  );
}

export async function getQrCode(
  id: string,
): Promise<QrCodeActionResult<QrCodeView>> {
  return run("getQrCode", (scope) => getCode(scope, parse(codeIdSchema, id)));
}

export async function getQrCodeUsage(): Promise<QrCodeActionResult<CodeUsage>> {
  return run("getQrCodeUsage", getCodeUsage);
}
