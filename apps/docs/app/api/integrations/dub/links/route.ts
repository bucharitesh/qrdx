import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDubClient, getDubIntegration } from "@/lib/integrations";

/**
 * GET /api/integrations/dub/links
 * Fetch all Dub links for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Dub integration for this user
    const integration = await getDubIntegration(session.user.id);

    if (!integration || integration.status !== "active") {
      return NextResponse.json(
        { error: "Dub integration not connected" },
        { status: 404 },
      );
    }

    // Create Dub client
    const dubClient = getDubClient(integration.accessToken);

    // Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const domain = searchParams.get("domain") || undefined;
    const page = searchParams.get("page")
      ? Number.parseInt(searchParams.get("page") as string, 10)
      : 1;
    const pageSize = searchParams.get("pageSize")
      ? Number.parseInt(searchParams.get("pageSize") as string, 10)
      : 50;

    // Fetch links from Dub API
    const links = await dubClient.getLinks({
      search,
      domain,
      page,
      pageSize,
    });

    return NextResponse.json({
      links,
      meta: {
        page,
        pageSize,
        hasMore: links.length === pageSize,
      },
    });
  } catch (error) {
    console.error("Error fetching Dub links:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch Dub links",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
