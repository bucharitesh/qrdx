import type { NextRequest } from "next/server";
import { withApiUsage } from "@/lib/analytics/usage";
import { unknownEndpointError } from "@/lib/api-errors";
import { handleError } from "@/lib/error-response";

// Any /v1 path without its own route (qrdx.dev/api/v1/... and, through the
// next.config rewrite, api.qrdx.dev/v1/...): a JSON 404 in the API's error
// shape instead of the site's HTML 404 page. Real routes are more specific,
// so they always win over this catch-all.

type Context = { params: Promise<{ missing?: string[] }> };

async function notFound(req: NextRequest, { params }: Context) {
  const { missing = [] } = await params;
  const path = `/v1${missing.length ? `/${missing.join("/")}` : ""}`;
  return handleError(unknownEndpointError(req.method, path.slice(0, 200)));
}

// Counted with the API's requests (lib/analytics/usage.ts), as "unknown".
const counted = withApiUsage("unknown", notFound);

export const GET = counted;
export const POST = counted;
export const PUT = counted;
export const PATCH = counted;
export const DELETE = counted;
