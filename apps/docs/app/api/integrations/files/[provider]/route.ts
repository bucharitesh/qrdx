import { NextResponse } from "next/server";
import { z } from "zod";
import {
  providerErrorResponse,
  resolveFilePickerClient,
} from "@/lib/connected-accounts/server";

type RouteContext = { params: Promise<{ provider: string }> };

const querySchema = z.object({
  folderId: z.string().max(256).optional(),
  search: z.string().trim().max(200).optional(),
  cursor: z.string().max(4096).optional(),
});

/** GET /api/integrations/files/:provider — browse a folder or search. */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const resolved = await resolveFilePickerClient(provider);
  if (!resolved.ok) return resolved.response;

  const { searchParams } = new URL(request.url);
  const query = querySchema.safeParse({
    folderId: searchParams.get("folderId") || undefined,
    search: searchParams.get("search") || undefined,
    cursor: searchParams.get("cursor") || undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    return NextResponse.json(await resolved.client.list(query.data));
  } catch (error) {
    return providerErrorResponse(error, {
      userId: resolved.userId,
      provider,
      action: "list files",
    });
  }
}
