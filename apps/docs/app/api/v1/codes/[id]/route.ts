import type { NextRequest } from "next/server";
import {
  codeIdSchema,
  deleteCode,
  getCode,
  hasAnyField,
  setCodeArchived,
  updateCode,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import {
  assertJson,
  MAX_BODY_BYTES,
  NO_STORE,
  resolveApiScope,
  serializeCode,
} from "../_lib/api";
import { patchCodeSchema } from "../_lib/schemas";
import { resolveCodeStyles } from "../_lib/style";

type Context = { params: Promise<{ id: string }> };

async function codeId({ params }: Context): Promise<string> {
  return parseWithSchema(codeIdSchema, (await params).id);
}

export const GET = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "read");
      const code = await getCode(scope, await codeId(context));
      return Response.json(
        { data: serializeCode(code) },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "GET /api/v1/codes/[id]" });
    }
  },
);

/** Destination, title and style stay editable on every plan; `archived` toggles redirects. */
export const PATCH = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      assertJson(req);
      const id = await codeId(context);
      const { archived, ...fields } = parseWithSchema(
        patchCodeSchema,
        await resolveCodeStyles(
          scope,
          await readJsonBody(req, MAX_BODY_BYTES),
          async () => (await getCode(scope, id)).style?.customLogo ?? null,
        ),
      );

      let code = hasAnyField(fields)
        ? await updateCode(scope, id, fields)
        : await getCode(scope, id);
      if (archived !== undefined) {
        code = await setCodeArchived(scope, id, archived);
      }
      return Response.json(
        { data: serializeCode(code) },
        { headers: NO_STORE },
      );
    } catch (error) {
      return handleError(error, { route: "PATCH /api/v1/codes/[id]" });
    }
  },
);

export const DELETE = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
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
  },
);
