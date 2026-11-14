import type { NextRequest } from "next/server";
import {
  assertJson,
  NO_STORE,
  resolveApiScope,
} from "@/app/api/v1/codes/_lib/api";
import { assertArtConfigured, MAX_ART_REQUEST_BODY_BYTES } from "@/lib/ai/art";
import { withApiUsage } from "@/lib/analytics/usage";
import { withApiQuotaHeaders } from "@/lib/api-quota";
import { handleError } from "@/lib/error-response";
import { readJsonBody } from "@/lib/request-guards";
import {
  artImageBytes,
  parseApiArtRequest,
  runApiArt,
  serializeArt,
} from "./_lib/art";

// POST /v1/art: one AI QR art image, checked to scan, on the monthly AI art
// allowance of the workspace the key acts on (the app's, lib/ai/art.ts). The
// art model call gives up (and the credit is refunded) before this limit.
export const maxDuration = 60;

/** `?format=png` or `Accept: image/png`: the image's bytes instead of JSON. */
function wantsImage(req: NextRequest): boolean {
  const format = req.nextUrl.searchParams.get("format")?.toLowerCase();
  if (format) return format === "png";
  return (req.headers.get("accept") ?? "")
    .toLowerCase()
    .startsWith("image/png");
}

const handlePOST = withApiQuotaHeaders(async (req: NextRequest) => {
  try {
    // Before the key, so a server without AI art uses none of the quota.
    assertArtConfigured();
    const scope = await resolveApiScope(req, "write");
    assertJson(req);
    const { request, code } = await parseApiArtRequest(
      scope,
      await readJsonBody(req, MAX_ART_REQUEST_BODY_BYTES),
    );
    const result = await runApiArt(scope, request, req, req.signal);
    const body = serializeArt(result, code);

    if (wantsImage(req)) {
      const { bytes, mediaType } = artImageBytes(body.data.imageUrl);
      const headers: Record<string, string> = {
        ...NO_STORE,
        "Content-Type": mediaType,
        "X-QRdx-Seed": String(body.data.seed),
        "X-QRdx-Mode": body.data.mode,
        "X-QRdx-Blend": body.data.blend,
        "X-QRdx-Blend-Strength": String(body.data.blendStrength),
      };
      const remaining = body.credits?.remaining;
      if (remaining !== undefined && remaining !== null) {
        headers["X-QRdx-Credits-Remaining"] = String(remaining);
      }
      return new Response(new Uint8Array(bytes), { headers });
    }
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) {
      return new Response("Request aborted by client", { status: 499 });
    }
    return handleError(error, { route: "POST /api/v1/art" });
  }
});

// Counted with the API's requests (lib/analytics/usage.ts).
export const POST = withApiUsage("art", handlePOST);
