import "server-only";

import {
  database as db,
  landingPage,
  member,
  oauthApp,
  organization,
  qrCode,
  user,
} from "@repo/database";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";
import type { ParsedSearch, SearchKind } from "./rules";

// Global admin search (/admin/search). Each group runs its own small,
// bounded query; fuzzy (ILIKE) matching needs 2+ characters, and destination
// matching 3+, so a stray letter never scans every code.

const LIMIT = 8;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const contains = (value: string) => `%${escapeLike(value)}%`;

function searchUsers(search: ParsedSearch) {
  const { term } = search;
  const fuzzy = term.length >= 2;
  return db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      or(
        eq(user.id, term),
        fuzzy ? ilike(user.email, contains(term)) : undefined,
        fuzzy && !search.email ? ilike(user.name, contains(term)) : undefined,
      ),
    )
    .orderBy(desc(user.createdAt))
    .limit(LIMIT);
}

function codeMatch(search: ParsedSearch, pagesOnly: boolean): SQL | undefined {
  const { term, slug } = search;
  const matches: (SQL | undefined)[] = [
    eq(qrCode.slug, slug ?? term),
    eq(qrCode.id, term),
  ];
  if (!slug && term.length >= 2) {
    matches.push(ilike(qrCode.slug, `${escapeLike(term)}%`));
    matches.push(ilike(qrCode.title, contains(term)));
    if (term.length >= 3 && !pagesOnly) {
      matches.push(ilike(qrCode.destinationUrl, contains(term)));
    }
  }
  return or(...matches);
}

const codeColumns = {
  id: qrCode.id,
  slug: qrCode.slug,
  kind: qrCode.kind,
  title: qrCode.title,
  destinationUrl: qrCode.destinationUrl,
  isActive: qrCode.isActive,
  pausedAt: qrCode.pausedAt,
  scanCount: qrCode.scanCount,
  createdAt: qrCode.createdAt,
  ownerId: user.id,
  ownerEmail: user.email,
};

/** Page codes are left to the pages group when both are searched. */
function searchCodes(search: ParsedSearch, withPages: boolean) {
  return db
    .select(codeColumns)
    .from(qrCode)
    .innerJoin(user, eq(user.id, qrCode.userId))
    .where(
      and(
        codeMatch(search, false),
        withPages ? eq(qrCode.kind, "redirect") : undefined,
      ),
    )
    .orderBy(desc(qrCode.createdAt))
    .limit(LIMIT);
}

/** Hosted pages are codes of kind "page"; their slug is the /p/<slug> path. */
function searchPages(search: ParsedSearch) {
  const { term, slug } = search;
  return db
    .select({ ...codeColumns, pageTitle: landingPage.title })
    .from(qrCode)
    .innerJoin(user, eq(user.id, qrCode.userId))
    .leftJoin(landingPage, eq(landingPage.id, qrCode.pageId))
    .where(
      and(
        eq(qrCode.kind, "page"),
        or(
          codeMatch(search, true),
          !slug && term.length >= 2
            ? ilike(landingPage.title, contains(term))
            : undefined,
        ),
      ),
    )
    .orderBy(desc(qrCode.createdAt))
    .limit(LIMIT);
}

async function searchTeams(search: ParsedSearch) {
  const { term } = search;
  const teams = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(
      or(
        eq(organization.id, term),
        eq(organization.slug, term.toLowerCase()),
        term.length >= 2 ? ilike(organization.name, contains(term)) : undefined,
      ),
    )
    .orderBy(desc(organization.createdAt))
    .limit(LIMIT);
  if (teams.length === 0) return [];

  const ids = teams.map((team) => team.id);
  const [members, owners] = await Promise.all([
    db
      .select({ organizationId: member.organizationId, total: count() })
      .from(member)
      .where(inArray(member.organizationId, ids))
      .groupBy(member.organizationId),
    db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        userId: user.id,
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(inArray(member.organizationId, ids), ilike(member.role, "%owner%")),
      ),
  ]);
  const totals = new Map(members.map((row) => [row.organizationId, row.total]));
  return teams.map((team) => ({
    ...team,
    members: totals.get(team.id) ?? 0,
    owners: owners
      .filter((row) => row.organizationId === team.id)
      .map((row) => ({ id: row.userId, email: row.email })),
  }));
}

function searchApps(search: ParsedSearch) {
  const { term } = search;
  return db
    .select({
      id: oauthApp.id,
      name: oauthApp.name,
      clientId: oauthApp.clientId,
      isActive: oauthApp.isActive,
      verified: oauthApp.verified,
      createdAt: oauthApp.createdAt,
      ownerId: user.id,
      ownerEmail: user.email,
    })
    .from(oauthApp)
    .leftJoin(user, eq(user.id, oauthApp.ownerUserId))
    .where(
      or(
        eq(oauthApp.clientId, term),
        eq(oauthApp.id, term),
        !search.clientId && term.length >= 2
          ? ilike(oauthApp.name, contains(term))
          : undefined,
      ),
    )
    .orderBy(desc(oauthApp.createdAt))
    .limit(LIMIT);
}

export type AdminSearchResults = Awaited<ReturnType<typeof runAdminSearch>>;

const skip = <T>(): Promise<T[]> => Promise.resolve([]);

export async function runAdminSearch(search: ParsedSearch) {
  const wants = (kind: SearchKind) => search.kinds.includes(kind);
  const [users, codes, pages, teams, apps] = await Promise.all([
    wants("user") ? searchUsers(search) : skip<never>(),
    wants("code") ? searchCodes(search, wants("page")) : skip<never>(),
    wants("page") ? searchPages(search) : skip<never>(),
    wants("team") ? searchTeams(search) : skip<never>(),
    wants("app") ? searchApps(search) : skip<never>(),
  ]);
  return { users, codes, pages, teams, apps };
}
