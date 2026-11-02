import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInPath } from "@/lib/safe-redirect";
import { getActiveWorkspace } from "@/lib/scope";
import { entryPath, workspaceHref } from "@/lib/workspace-paths";
import { UnauthorizedError } from "@/types/errors";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * /dashboard opens the person's default workspace: the one last opened,
 * else their own (made now for accounts from before workspaces). Links that
 * can't know the slug (docs, API messages) add ?to=<section>, e.g.
 * /dashboard?to=settings/developers; other query parameters are kept.
 */
export default async function DashboardIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "to") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") query.append(key, item);
    }
  }
  const search = query.size > 0 ? `?${query}` : "";

  let slug: string | null = null;
  try {
    slug = (await getActiveWorkspace()).workspace.slug;
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
  }
  if (!slug) {
    const back = new URLSearchParams(query);
    if (typeof params.to === "string") back.set("to", params.to);
    redirect(signInPath(`/dashboard${back.size > 0 ? `?${back}` : ""}`));
  }
  redirect(`${workspaceHref(slug, entryPath(params.to) ?? "")}${search}`);
}
