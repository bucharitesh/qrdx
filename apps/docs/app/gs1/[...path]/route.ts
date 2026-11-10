import type { NextRequest } from "next/server";
import {
  CUSTOM_DOMAIN_HEADER,
  isCustomDomainRequest,
} from "@/app/dashboard/domains/_lib/hostname";
import { resolveShortLink } from "@/app/q/[slug]/resolve";
import { statusPage } from "@/app/q/[slug]/status-page";
import { parseDigitalLinkPath } from "@/lib/gs1/digital-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GS1 Digital Links on a verified custom domain:
// https://<domain>/01/<GTIN>[/22/<variant>][/10/<lot>][/21/<serial>] opens
// the product page with that GTIN through its code on the domain, and
// counts a scan like the code's short link. proxy.ts rewrites those paths
// here (host-routing.ts) and tags the request with the domain id. On QRdx's
// shared host GTINs never resolve: a global GTIN namespace would let
// anyone claim another brand's product.

type Context = { params: Promise<{ path: string[] }> };

async function resolve(
  request: NextRequest,
  { params }: Context,
  record: boolean,
): Promise<Response> {
  const domainId = request.headers.get(CUSTOM_DOMAIN_HEADER);
  if (!domainId || !isCustomDomainRequest(request.headers)) {
    return statusPage("not-found");
  }
  const { path } = await params;
  const parsed = parseDigitalLinkPath(
    `/${path.map((part) => encodeURIComponent(part)).join("/")}`,
  );
  if (!parsed) return statusPage("not-found");
  if (!parsed.ok) {
    return statusPage("invalid-gs1", {
      message: `${parsed.message} Check the link, or scan the code on the pack again.`,
    });
  }
  return resolveShortLink(
    request,
    { gtin: parsed.link.gtin, domainId },
    { record },
  );
}

export function GET(request: NextRequest, context: Context) {
  return resolve(request, context, true);
}

export function HEAD(request: NextRequest, context: Context) {
  return resolve(request, context, false);
}

/** Password gate submissions; the GET that showed the gate counted the scan. */
export function POST(request: NextRequest, context: Context) {
  return resolve(request, context, false);
}
