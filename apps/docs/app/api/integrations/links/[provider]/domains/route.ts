import { BitlyClient, getDefaultShortLinkDomain } from "@repo/integrations";
import { NextResponse } from "next/server";
import {
  providerErrorResponse,
  resolveShortLinkClient,
} from "@/lib/connected-accounts/server";

type RouteContext = { params: Promise<{ provider: string }> };

/**
 * GET /api/integrations/links/:provider/domains — domains new links can use
 * (and Bitly groups), plus the default picked in settings.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const resolved = await resolveShortLinkClient(provider);
  if (!resolved.ok) return resolved.response;

  try {
    const [domains, groups] = await Promise.all([
      resolved.client.listDomains(),
      resolved.client instanceof BitlyClient
        ? resolved.client.listGroups()
        : Promise.resolve(undefined),
    ]);
    const saved = getDefaultShortLinkDomain(resolved.connection.metadata);
    const defaultDomainId =
      saved && domains.some((domain) => domain.id === saved.id)
        ? saved.id
        : (domains.find((domain) => domain.branded) ?? domains[0])?.id;
    return NextResponse.json({ domains, groups, defaultDomainId });
  } catch (error) {
    return providerErrorResponse(error, {
      userId: resolved.userId,
      provider,
      action: "list domains",
    });
  }
}
