import { NextResponse } from "next/server";
import { z } from "zod";
import {
  providerErrorResponse,
  providerWriteLimiter,
  resolveFilePickerClient,
} from "@/lib/connected-accounts/server";

type RouteContext = { params: Promise<{ provider: string }> };

const shareSchema = z.object({
  id: z.string().min(1).max(256),
  kind: z.enum(["file", "folder", "page"]),
});

/**
 * POST /api/integrations/files/:provider/share — create (or reuse) the
 * item's share link; returns the link plus who can open it.
 */
export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const resolved = await resolveFilePickerClient(
    provider,
    providerWriteLimiter,
  );
  if (!resolved.ok) return resolved.response;

  const input = shareSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400 });
  }

  try {
    return NextResponse.json(await resolved.client.createShareLink(input.data));
  } catch (error) {
    return providerErrorResponse(error, {
      userId: resolved.userId,
      provider,
      action: "create share link",
    });
  }
}
