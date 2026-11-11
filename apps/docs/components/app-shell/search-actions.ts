"use server";

import { database as db, landingPage } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { listCodes } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getTemplate } from "@/lib/landing/templates";
import { type ActiveScope, getActiveWorkspace } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { workspaceHref } from "@/lib/workspace-paths";
import { UnauthorizedError } from "@/types/errors";

/** One row of the ⌘K palette's workspace results. */
export interface SearchHit {
  id: string;
  href: string;
  title: string;
  /** Short link, destination or page type */
  detail: string;
  archived?: boolean;
}

export type WorkspaceSearchResult =
  | { ok: true; codes: SearchHit[]; pages: SearchHit[] }
  | { ok: false; error: string };

const RESULTS_PER_GROUP = 5;
const MAX_QUERY = 100;

// Typing sends at most one request per pause (the palette debounces), so
// this only stops scripted scraping of a workspace.
const searchLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});

function pageScopeWhere(scope: ActiveScope): SQL {
  return eq(landingPage.organizationId, scope.organizationId);
}

async function searchPages(
  scope: ActiveScope,
  slug: string,
  term: string,
): Promise<SearchHit[]> {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select({
      id: landingPage.id,
      title: landingPage.title,
      type: landingPage.type,
    })
    .from(landingPage)
    .where(and(pageScopeWhere(scope), ilike(landingPage.title, pattern)))
    .orderBy(desc(landingPage.updatedAt), desc(landingPage.id))
    .limit(RESULTS_PER_GROUP);
  return rows.map((row) => ({
    id: row.id,
    href: workspaceHref(slug, `/pages/${encodeURIComponent(row.id)}`),
    title: row.title?.trim() || "Untitled page",
    detail: getTemplate(row.type)?.label ?? "Landing page",
  }));
}

/**
 * Codes (title, destination, notes, tags or short link: the same match as
 * the codes list) and landing pages (title) of the active workspace. Only
 * what the codes and pages screens already show this person.
 */
export async function searchWorkspace(
  query: string,
): Promise<WorkspaceSearchResult> {
  const term =
    typeof query === "string" ? query.trim().slice(0, MAX_QUERY) : "";
  if (term.length < 2) return { ok: true, codes: [], pages: [] };

  try {
    const { scope, workspace } = await getActiveWorkspace();
    const { success } = await searchLimiter.limit(`app-search:${scope.userId}`);
    if (!success) {
      return { ok: false, error: "Too many searches. Wait a moment." };
    }
    const [{ codes }, pages] = await Promise.all([
      listCodes(scope, { q: term, status: "all", limit: RESULTS_PER_GROUP }),
      searchPages(scope, workspace.slug, term),
    ]);
    return {
      ok: true,
      codes: codes.map((code) => ({
        id: code.id,
        href: workspaceHref(
          workspace.slug,
          `/codes/${encodeURIComponent(code.id)}`,
        ),
        title: code.title?.trim() || code.destinationUrl,
        detail: code.shortLink.replace(/^https?:\/\//, ""),
        archived: code.archivedAt !== null,
      })),
      pages,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, error: "Sign in again to search." };
    }
    logError(error as Error, { action: "app-shell.searchWorkspace" });
    return { ok: false, error: "Search isn't working right now." };
  }
}
