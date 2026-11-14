import { getDefaultShortLinkDomain, SLUG_SUPPORT } from "@repo/integrations";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  providerErrorResponse,
  providerWriteLimiter,
  resolveShortLinkClient,
} from "@/lib/connected-accounts/server";

type RouteContext = { params: Promise<{ provider: string }> };

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  cursor: z.string().max(2048).optional(),
  domainId: z.string().max(253).optional(),
});

const createSchema = z.object({
  longUrl: z.url({ protocol: /^https?$/ }).max(2048),
  domainId: z.string().trim().min(1).max(253).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "Use letters, numbers, - and _ only")
    .optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

/** GET /api/integrations/links/:provider — the account's links, newest first. */
export async function GET(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const resolved = await resolveShortLinkClient(provider);
  if (!resolved.ok) return resolved.response;

  const { searchParams } = new URL(request.url);
  const query = listQuerySchema.safeParse({
    search: searchParams.get("search") || undefined,
    cursor: searchParams.get("cursor") || undefined,
    domainId: searchParams.get("domainId") || undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const page = await resolved.client.listLinks({ ...query.data, limit: 50 });
    return NextResponse.json(page);
  } catch (error) {
    return providerErrorResponse(error, {
      userId: resolved.userId,
      provider,
      action: "list links",
    });
  }
}

/** POST /api/integrations/links/:provider — create a short link. */
export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const resolved = await resolveShortLinkClient(provider, providerWriteLimiter);
  if (!resolved.ok) return resolved.response;

  const body = await request.json().catch(() => null);
  const input = createSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      {
        error: input.error.issues[0]?.message ?? "Invalid link",
        details: input.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const { domainId, slug, ...rest } = input.data;
    // Only domains the account really has; else the one picked in settings
    let domain = getDefaultShortLinkDomain(resolved.connection.metadata);
    if (domainId) {
      const match = (await resolved.client.listDomains()).find(
        (item) => item.id === domainId,
      );
      if (!match) {
        return NextResponse.json(
          { error: "That domain isn't in your account" },
          { status: 400 },
        );
      }
      domain = { id: match.id, hostname: match.hostname };
    }

    const link = await resolved.client.createLink({
      ...rest,
      domain,
      slug:
        resolved.provider && SLUG_SUPPORT[resolved.provider] ? slug : undefined,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return providerErrorResponse(error, {
      userId: resolved.userId,
      provider,
      action: "create link",
    });
  }
}
