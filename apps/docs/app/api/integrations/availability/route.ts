import { NextResponse } from "next/server";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { toAvailabilityView } from "@/lib/integration-availability-view";

/**
 * GET /api/integrations/availability — which integrations the editor should
 * leave out (production and preview) or mark "Needs setup" (local dev, with
 * the missing env variable names). Never returns values.
 */
export function GET() {
  return NextResponse.json(toAvailabilityView(getIntegrationAvailability()), {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
