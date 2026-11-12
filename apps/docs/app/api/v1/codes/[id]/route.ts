import type { NextRequest } from "next/server";
import { switchCodeKind } from "@/app/(app)/dashboard/codes/_lib/code-kind";
import {
  codeIdSchema,
  deleteCode,
  enforceCreateRateLimit,
  getCode,
  hasAnyField,
  setCodeArchived,
  updateCode,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { handleError } from "@/lib/error-response";
import { parseWithSchema, readJsonBody } from "@/lib/request-guards";
import { setCodePreciseLocation } from "@/lib/scan-location/settings";
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

const handleGET = withApiQuotaHeaders(
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

/**
 * Destination, title and style stay editable on every plan; `archived`
 * toggles redirects; `kind` switches between a website link and a hosted
 * page (code-kind.ts), before the other fields apply.
 */
const handlePATCH = withApiQuotaHeaders(
  async (req: NextRequest, context: Context) => {
    try {
      const scope = await resolveApiScope(req, "write");
      assertJson(req);
      const id = await codeId(context);
      const { archived, kind, pageId, page, preciseLocation, ...fields } =
        parseWithSchema(
          patchCodeSchema,
          await resolveCodeStyles(
            scope,
            await readJsonBody(req, MAX_BODY_BYTES),
            async () => (await getCode(scope, id)).style?.customLogo ?? null,
          ),
        );

      // A new page is created like one from the dashboard (same per-user cap).
      if (page) await enforceCreateRateLimit(scope.userId);
      let code = kind
        ? await switchCodeKind(
            scope,
            id,
            kind === "redirect"
              ? { kind, destinationUrl: fields.destinationUrl as string }
              : pageId
                ? { kind, pageId }
                : { kind, page: page as NonNullable<typeof page> },
          )
        : null;
      // The switch set the destination (or the page) already.
      if (kind) fields.destinationUrl = undefined;
      if (hasAnyField(fields)) code = await updateCode(scope, id, fields);
      code ??= await getCode(scope, id);
      if (archived !== undefined) {
        code = await setCodeArchived(scope, id, archived);
      }
      // Precise location (lib/scan-location): stored in the code's pixel settings.
      if (preciseLocation !== undefined) {
        await setCodePreciseLocation(scope, id, preciseLocation);
        code = await getCode(scope, id);
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

const handleDELETE = withApiQuotaHeaders(
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

// Counted with the API's requests (lib/analytics/usage.ts).
export const GET = withApiUsage("codes", handleGET);
export const PATCH = withApiUsage("codes", handlePATCH);
export const DELETE = withApiUsage("codes", handleDELETE);
