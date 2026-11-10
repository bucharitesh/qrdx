import type { NextRequest } from "next/server";
import { resolveShortLink } from "./resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

// The redirect pipeline itself is in ./resolve.ts (shared with GS1 Digital
// Links on custom domains, app/gs1/[...path]/route.ts).

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, { slug }, { record: true });
}

export async function HEAD(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, { slug }, { record: false });
}

/** Gate form submissions (password); the GET that showed the gate already counted the scan. */
export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return resolveShortLink(request, { slug }, { record: false });
}
