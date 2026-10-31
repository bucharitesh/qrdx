import { auth } from "@repo/auth/server";
import {
  createGoogleDriveClient,
  getIntegration,
  getIntegrationConfigWithEnv,
} from "@repo/integrations";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const MAX_PAGE_SIZE = 100;

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

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getDriveQuery(search: string | null, sourceType: string | null) {
  const baseQuery = ["trashed=false"];
  const trimmedSearch = search?.trim();

  if (trimmedSearch) {
    baseQuery.push(`name contains '${escapeDriveQuery(trimmedSearch)}'`);
  }

  if (sourceType === "folder") {
    baseQuery.push("mimeType='application/vnd.google-apps.folder'");
  }

  if (sourceType === "file") {
    baseQuery.push("mimeType!='application/vnd.google-apps.folder'");
  }

  return baseQuery.join(" and ");
}

async function getActiveDriveClient() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const integration = await getIntegration(
    session.user.id,
    "google-drive",
    (slug) => getIntegrationConfigWithEnv(slug, env),
  );

  if (!integration || integration.status !== "active") {
    return {
      error: NextResponse.json(
        { error: "Google Drive integration not connected" },
        { status: 404 },
      ),
    };
  }

  return {
    driveClient: createGoogleDriveClient(integration.accessToken),
  };
}

export async function GET(request: Request) {
  try {
    const clientResult = await getActiveDriveClient();
    if ("error" in clientResult) return clientResult.error;

    const { searchParams } = new URL(request.url);
    const pageSize = getBoundedInteger(
      searchParams.get("pageSize"),
      30,
      MAX_PAGE_SIZE,
    );

    const result = await clientResult.driveClient.listFiles({
      pageSize,
      pageToken: searchParams.get("pageToken")?.slice(0, 1024) || undefined,
      query: getDriveQuery(
        searchParams.get("search")?.slice(0, 200) ?? null,
        searchParams.get("sourceType"),
      ),
      orderBy: "modifiedTime desc",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching Google Drive files:", error);
    return NextResponse.json(
      { error: "Failed to fetch Google Drive files" },
      { status: 500 },
    );
  }
}
