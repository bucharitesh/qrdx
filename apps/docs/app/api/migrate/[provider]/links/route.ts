import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { explainProviderError } from "@/lib/migrate/adapters";
import { ImportError } from "@/lib/migrate/importer";
import { isApiProviderId } from "@/lib/migrate/providers";
import { deps, migrateScope, respond } from "@/lib/migrate/server/http";
import { getSource } from "@/lib/migrate/server/sources";
import { parseWithSchema } from "@/lib/request-guards";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string }> };

const querySchema = z.object({
  cursor: z.string().trim().max(500).optional(),
  search: z.string().trim().max(200).optional(),
  domain: z.string().trim().toLowerCase().max(253).optional(),
  tag: z.string().trim().max(100).optional(),
  domains: z.enum(["1"]).optional(),
});

/**
 * One page of the connected account's links, with the ids already imported
 * into this workspace (`imported`) so the list can mark them.
 */
export function GET(req: Request, context: Context) {
  return respond("GET /api/migrate/[provider]/links", async () => {
    const { provider } = await context.params;
    if (!isApiProviderId(provider)) {
      throw new HttpError(404, "NOT_FOUND", "Unknown provider.");
    }
    const scope = await migrateScope(req);
    const query = parseWithSchema(
      querySchema,
      Object.fromEntries(new URL(req.url).searchParams),
    );
    const source = await getSource(scope.userId, provider);
    try {
      const [page, domains] = await Promise.all([
        source.listLinks(query.cursor ?? null, {
          search: query.search || undefined,
          domain: query.domain || undefined,
          tag: query.tag || undefined,
        }),
        query.domains && source.listDomains ? source.listDomains() : null,
      ]);
      const imported = await deps.repo.findImported(
        scope,
        provider,
        page.links.map((link) => link.id),
      );
      return {
        ...page,
        domains,
        imported: Object.fromEntries(
          [...imported].map(([key, ref]) => [key, ref.shortLink]),
        ),
      };
    } catch (error) {
      if (error instanceof ImportError || error instanceof HttpError)
        throw error;
      const explained = explainProviderError(provider, error);
      throw new ImportError(
        explained.kind === "auth" ? 409 : 502,
        explained.kind === "auth" ? "RECONNECT" : "PROVIDER_ERROR",
        explained.kind === "not-found" || explained.kind === "other"
          ? "The provider couldn't list your links right now. Try again in a minute."
          : explained.message,
      );
    }
  });
}
