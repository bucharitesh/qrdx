import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDubClient, getDubIntegration } from "@/lib/integrations";

const MAX_PAGE_SIZE = 100;

const createLinkSchema = z.object({
  url: z.string().url(),
  domain: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  expiresAt: z.string().optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  image: z.string().url().optional(),
});

const updateLinkSchema = createLinkSchema.partial().extend({
  linkId: z.string().min(1),
});

function getBoundedInteger(
  value: string | null,
  fallback: number,
  max: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

async function getActiveDubClient() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const integration = await getDubIntegration(session.user.id);

  if (!integration || integration.status !== "active") {
    return {
      error: NextResponse.json(
        { error: "Dub integration not connected" },
        { status: 404 },
      ),
    };
  }

  return {
    dubClient: getDubClient(integration.accessToken),
  };
}

/**
 * GET /api/integrations/dub/links
 * Fetch all Dub links for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const clientResult = await getActiveDubClient();
    if ("error" in clientResult) return clientResult.error;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const domain = searchParams.get("domain") || undefined;
    const page = getBoundedInteger(searchParams.get("page"), 1, 10_000);
    const pageSize = getBoundedInteger(
      searchParams.get("pageSize"),
      50,
      MAX_PAGE_SIZE,
    );

    // Fetch links from Dub API
    const links = await clientResult.dubClient.getLinks({
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

export async function POST(request: Request) {
  try {
    const clientResult = await getActiveDubClient();
    if ("error" in clientResult) return clientResult.error;

    const body = await request.json();
    const validation = createLinkSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid Dub link payload", details: validation.error.issues },
        { status: 400 },
      );
    }

    const link = await clientResult.dubClient.createLink(validation.data);
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("Error creating Dub link:", error);
    return NextResponse.json(
      {
        error: "Failed to create Dub link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const clientResult = await getActiveDubClient();
    if ("error" in clientResult) return clientResult.error;

    const body = await request.json();
    const validation = updateLinkSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid Dub link payload", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { linkId, ...data } = validation.data;
    const link = await clientResult.dubClient.updateLink(linkId, data);
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Error updating Dub link:", error);
    return NextResponse.json(
      {
        error: "Failed to update Dub link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const clientResult = await getActiveDubClient();
    if ("error" in clientResult) return clientResult.error;

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json(
        { error: "Dub link ID is required" },
        { status: 400 },
      );
    }

    const link = await clientResult.dubClient.updateLink(linkId, {
      archived: true,
    });
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Error archiving Dub link:", error);
    return NextResponse.json(
      {
        error: "Failed to archive Dub link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
