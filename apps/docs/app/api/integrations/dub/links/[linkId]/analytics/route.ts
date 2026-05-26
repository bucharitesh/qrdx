import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDubClient, getDubIntegration } from "@/lib/integrations";

const analyticsQuerySchema = z.object({
  event: z.enum(["clicks", "leads", "sales"]).default("clicks"),
  groupBy: z
    .enum(["timeseries", "countries", "devices", "browsers", "os"])
    .default("timeseries"),
  interval: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  timezone: z.string().min(1).default("UTC"),
});

type RouteContext = {
  params: Promise<{ linkId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const integration = await getDubIntegration(session.user.id);

    if (!integration || integration.status !== "active") {
      return NextResponse.json(
        { error: "Dub integration not connected" },
        { status: 404 },
      );
    }

    const { linkId } = await context.params;
    if (!linkId) {
      return NextResponse.json(
        { error: "Dub link ID is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const validation = analyticsQuerySchema.safeParse({
      event: searchParams.get("event") || undefined,
      groupBy: searchParams.get("groupBy") || undefined,
      interval: searchParams.get("interval") || undefined,
      timezone: searchParams.get("timezone") || undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid analytics query",
          details: validation.error.issues,
        },
        { status: 400 },
      );
    }

    const dubClient = getDubClient(integration.accessToken);
    const analytics = await dubClient.getAnalytics({
      linkId,
      ...validation.data,
    });

    return NextResponse.json({ analytics, meta: validation.data });
  } catch (error) {
    console.error("Error fetching Dub analytics:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch Dub analytics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
