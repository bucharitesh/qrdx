import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  codeIdSchema,
  deleteCode,
  getCode,
  hasAnyField,
  setCodeArchived,
  updateCode,
  updateCodeFields,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
  serializeCode,
} from "../_lib/api";

type Context = { params: Promise<{ id: string }> };

const patchSchema = updateCodeFields
  .extend({ archived: z.boolean().optional() })
  .refine(hasAnyField, { message: "Nothing to update" });

async function codeId({ params }: Context): Promise<string> {
  return parseWithSchema(codeIdSchema, (await params).id);
}

export async function GET(req: NextRequest, context: Context) {
  try {
    const scope = await resolveApiScope(req, "read");
    const code = await getCode(scope, await codeId(context));
    return Response.json({ data: serializeCode(code) }, { headers: NO_STORE });
  } catch (error) {
    return handleError(error, { route: "GET /api/v1/codes/[id]" });
  }
}

/** Destination, title and style stay editable on every plan; `archived` toggles redirects. */
export async function PATCH(req: NextRequest, context: Context) {
  try {
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const id = await codeId(context);
    const { archived, ...fields } = parseWithSchema(
      patchSchema,
      await readJsonBody(req, MAX_BODY_BYTES),
    );

    let code = hasAnyField(fields)
      ? await updateCode(scope, id, fields)
      : await getCode(scope, id);
    if (archived !== undefined) {
      code = await setCodeArchived(scope, id, archived);
    }
    return Response.json({ data: serializeCode(code) }, { headers: NO_STORE });
  } catch (error) {
    return handleError(error, { route: "PATCH /api/v1/codes/[id]" });
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  try {
    const scope = await resolveApiScope(req, "write");
    const { id } = await deleteCode(scope, await codeId(context));
    return Response.json(
      { data: { id, deleted: true } },
      { headers: NO_STORE },
    );
  } catch (error) {
    return handleError(error, { route: "DELETE /api/v1/codes/[id]" });
  }
}
