import "server-only";

import { customDomain, database as db, qrCode } from "@repo/database";
import cuid from "cuid";
import { and, asc, count, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  type CustomDomainMode,
  checkManualDomain,
  checkVercelDomain,
  createVerificationToken,
  type DnsRecord,
  type DomainCheck,
  getCustomDomainMode,
  getVercelProjectDomain,
  manualRecords,
  removeVercelProjectDomain,
  VercelApiError,
} from "@/lib/custom-domains";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { type ActiveScope, isInScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { SHORT_LINK_BASE } from "@/lib/short-links";
import { parseCustomHostname } from "./hostname";

/**
 * Custom domains for dynamic QR short links (`https://<domain>/<slug>`).
 * Pro only; owners and admins manage a team's domains. A verified domain
 * stays verified until it is removed, so later DNS hiccups or a plan
 * downgrade never break printed codes.
 */

export const MAX_HOSTNAME_INPUT = 300;
// Unverified claims expire, so nobody can hold a domain they don't control.
const UNVERIFIED_CLAIM_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const recordSchema = z.object({
  type: z.enum(["A", "CNAME", "TXT"]),
  name: z.string(),
  value: z.string(),
  note: z.string().optional(),
});

/** Shape of custom_domain.verification */
const stateSchema = z.object({
  mode: z.enum(["vercel", "manual"]).optional(),
  /** Manual mode: value of the ownership TXT record */
  token: z.string().optional(),
  apexName: z.string().nullish(),
  records: z.array(recordSchema).default([]),
  message: z.string().nullish(),
  checkedAt: z.string().nullish(),
  verifiedAt: z.string().nullish(),
});

type VerificationState = z.infer<typeof stateSchema>;

function readState(value: unknown): VerificationState {
  const parsed = stateSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { records: [] };
}

export interface CustomDomainView {
  id: string;
  hostname: string;
  verified: boolean;
  /** DNS records to add (from the last check) */
  records: DnsRecord[];
  apexName: string | null;
  /** Result of the last check, when something is missing */
  message: string | null;
  checkedAt: Date | null;
  createdAt: Date;
  /** Dynamic codes that use this domain */
  codeCount: number;
}

type DomainRow = typeof customDomain.$inferSelect;

function toView(row: DomainRow, codeCount: number): CustomDomainView {
  const state = readState(row.verification);
  return {
    id: row.id,
    hostname: row.hostname,
    verified: row.verified,
    records: state.records,
    apexName: state.apexName ?? null,
    message: state.message ?? null,
    checkedAt: state.checkedAt ? new Date(state.checkedAt) : null,
    createdAt: row.createdAt,
    codeCount,
  };
}

// ─── Scope, role, plan ───────────────────────────────────────────────────────

function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(customDomain.organizationId, scope.organizationId)
    : (and(
        eq(customDomain.userId, scope.userId),
        isNull(customDomain.organizationId),
      ) as SQL);
}

/** Owners and admins manage a team's domains; everyone can use verified ones. */
export function canManageDomains(scope: ActiveScope): boolean {
  return scope.role !== "member";
}

function assertCanManage(scope: ActiveScope) {
  if (!canManageDomains(scope)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can manage custom domains.",
    );
  }
}

function requireMode(): Exclude<CustomDomainMode, "disabled"> {
  const mode = getCustomDomainMode();
  if (mode === "disabled") {
    throw new HttpError(
      503,
      "UNAVAILABLE",
      "Custom domains aren't available on this deployment.",
    );
  }
  return mode;
}

/** Domains allowed in the scope; throws when its plan has none. */
async function domainLimit(scope: ActiveScope): Promise<number> {
  const limit = getPlanLimits(await getPlanForScope(scope)).customDomains;
  if (limit <= 0) {
    throw new HttpError(
      402,
      "PLAN_REQUIRED",
      scope.organizationId
        ? "Custom domains need a team owner on Pro or Business."
        : "Custom domains are part of Pro and Business.",
    );
  }
  return limit;
}

const limitReached = (limit: number) =>
  new HttpError(
    402,
    "LIMIT_REACHED",
    `Your plan includes ${limit} custom domains. Remove one to add another.`,
  );

const notFound = () =>
  new HttpError(404, "NOT_FOUND", "Custom domain not found.");

const domainTaken = () =>
  new HttpError(
    409,
    "DOMAIN_TAKEN",
    "This domain is already connected to another account.",
  );

/** Turns a provider failure into a user-safe error (details go to the logs). */
function providerError(
  error: unknown,
  hostname: string,
  action: string,
): HttpError {
  if (error instanceof VercelApiError && error.status === 409) {
    return new HttpError(
      409,
      "DOMAIN_REJECTED",
      "This domain is already used by another Vercel project. Remove it there first, then try again.",
    );
  }
  if (error instanceof VercelApiError && error.status === 400) {
    return new HttpError(
      400,
      "DOMAIN_REJECTED",
      `${hostname} can't be connected. Check the spelling and try again.`,
    );
  }
  logError(error as Error, { action, hostname });
  return new HttpError(
    502,
    "UNAVAILABLE",
    "We couldn't reach our domain provider. Please try again in a minute.",
  );
}

async function countInScope(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(customDomain)
    .where(scopeWhere(scope));
  return row?.total ?? 0;
}

async function codeCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ domainId: qrCode.domainId, total: count() })
    .from(qrCode)
    .where(inArray(qrCode.domainId, ids))
    .groupBy(qrCode.domainId);
  return new Map(rows.map((row) => [row.domainId as string, row.total]));
}

async function findInScope(scope: ActiveScope, id: string): Promise<DomainRow> {
  const [row] = await db
    .select()
    .from(customDomain)
    .where(eq(customDomain.id, id))
    .limit(1);
  // Domains outside the scope look exactly like missing ones.
  if (!(row && isInScope(scope, row))) throw notFound();
  return row;
}

async function deleteRow(id: string) {
  await db.delete(customDomain).where(eq(customDomain.id, id));
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function listDomains(
  scope: ActiveScope,
): Promise<CustomDomainView[]> {
  const rows = await db
    .select()
    .from(customDomain)
    .where(scopeWhere(scope))
    .orderBy(asc(customDomain.createdAt), asc(customDomain.id));
  const counts = await codeCounts(rows.map((row) => row.id));
  return rows.map((row) => toView(row, counts.get(row.id) ?? 0));
}

export interface DomainsOverview {
  mode: CustomDomainMode;
  plan: Plan;
  /** Domains the scope's plan allows (0 = not included) */
  limit: number;
  canManage: boolean;
  domains: CustomDomainView[];
}

export async function getDomainsOverview(
  scope: ActiveScope,
): Promise<DomainsOverview> {
  const mode = getCustomDomainMode();
  const [plan, domains] = await Promise.all([
    getPlanForScope(scope),
    mode === "disabled" ? [] : listDomains(scope),
  ]);
  return {
    mode,
    plan,
    limit: getPlanLimits(plan).customDomains,
    canManage: canManageDomains(scope),
    domains,
  };
}

export interface DomainOptions {
  /** Verified domains that codes in the scope can use */
  domains: { id: string; hostname: string }[];
  /** False when the scope's plan has no custom domains */
  canUse: boolean;
  /** Host of default short links, e.g. qrdx.dev */
  defaultHost: string;
}

/** For the domain picker in the code dialog. */
export async function getDomainOptions(
  scope: ActiveScope,
): Promise<DomainOptions> {
  const defaultHost = new URL(SHORT_LINK_BASE).host;
  if (getCustomDomainMode() === "disabled") {
    return { domains: [], canUse: false, defaultHost };
  }
  const [plan, domains] = await Promise.all([
    getPlanForScope(scope),
    db
      .select({ id: customDomain.id, hostname: customDomain.hostname })
      .from(customDomain)
      .where(and(scopeWhere(scope), eq(customDomain.verified, true)))
      .orderBy(asc(customDomain.hostname)),
  ]);
  return {
    domains,
    canUse: getPlanLimits(plan).customDomains > 0,
    defaultHost,
  };
}

export interface DomainRef {
  id: string;
  hostname: string;
  verified: boolean;
}

/** Hostnames for the domain ids of a list of codes. */
export async function getDomainRefs(
  ids: (string | null)[],
): Promise<Map<string, DomainRef>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: customDomain.id,
      hostname: customDomain.hostname,
      verified: customDomain.verified,
    })
    .from(customDomain)
    .where(inArray(customDomain.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Codes may only use verified domains of their own scope, on a Pro plan. */
export async function assertBindableDomains(
  scope: ActiveScope,
  ids: string[],
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  await domainLimit(scope);

  const rows = await db
    .select({
      id: customDomain.id,
      hostname: customDomain.hostname,
      verified: customDomain.verified,
      userId: customDomain.userId,
      organizationId: customDomain.organizationId,
    })
    .from(customDomain)
    .where(inArray(customDomain.id, unique));

  for (const id of unique) {
    const row = rows.find((candidate) => candidate.id === id);
    if (!(row && isInScope(scope, row))) throw notFound();
    if (!row.verified) {
      throw new HttpError(
        400,
        "DOMAIN_NOT_VERIFIED",
        `Verify ${row.hostname} on the Domains page before using it for codes.`,
      );
    }
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function saveCheck(
  row: DomainRow,
  state: VerificationState,
  check: DomainCheck,
  mode: Exclude<CustomDomainMode, "disabled">,
): Promise<DomainRow> {
  const now = new Date().toISOString();
  const verification: VerificationState = {
    ...state,
    mode,
    apexName: check.apexName,
    records: check.records,
    message: check.message,
    checkedAt: now,
    verifiedAt: state.verifiedAt ?? (check.verified ? now : null),
  };
  const [saved] = await db
    .update(customDomain)
    // Never back to unverified: that would break printed codes.
    .set({ verified: row.verified || check.verified, verification })
    .where(eq(customDomain.id, row.id))
    .returning();
  if (!saved) throw notFound();
  return saved;
}

/**
 * Adds a domain to the scope. The limit is checked before and after the
 * insert, and the unique hostname makes concurrent claims safe.
 */
export async function addDomain(
  scope: ActiveScope,
  input: string,
): Promise<CustomDomainView> {
  const mode = requireMode();
  assertCanManage(scope);
  const parsed = parseCustomHostname(input.slice(0, MAX_HOSTNAME_INPUT));
  if (!parsed.ok) throw new HttpError(400, "VALIDATION_ERROR", parsed.error);
  const { hostname } = parsed;

  const limit = await domainLimit(scope);
  if ((await countInScope(scope)) >= limit) throw limitReached(limit);

  const [existing] = await db
    .select()
    .from(customDomain)
    .where(eq(customDomain.hostname, hostname))
    .limit(1);
  let reclaimed = false;
  if (existing) {
    if (isInScope(scope, existing)) {
      throw new HttpError(
        409,
        "ALREADY_EXISTS",
        `${hostname} is already in your domains.`,
      );
    }
    const stale =
      !existing.verified &&
      existing.createdAt.getTime() < Date.now() - UNVERIFIED_CLAIM_TTL_MS;
    if (!stale) throw domainTaken();
    await db
      .delete(customDomain)
      .where(
        and(eq(customDomain.id, existing.id), eq(customDomain.verified, false)),
      );
    reclaimed = true;
  }

  if (mode === "vercel" && !reclaimed) {
    // On the project but held by no account: one of the operator's own domains.
    let onProject: unknown;
    try {
      onProject = await getVercelProjectDomain(hostname);
    } catch (error) {
      throw providerError(error, hostname, "addDomain");
    }
    if (onProject) throw domainTaken();
  }

  const token = createVerificationToken();
  const state: VerificationState =
    mode === "manual"
      ? { mode, token, records: manualRecords(hostname, token) }
      : { mode, records: [] };
  const now = new Date();
  const [row] = await db
    .insert(customDomain)
    .values({
      id: cuid(),
      userId: scope.userId,
      organizationId: scope.organizationId,
      hostname,
      verified: false,
      verification: state,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: customDomain.hostname })
    .returning();
  if (!row) throw domainTaken();
  if ((await countInScope(scope)) > limit) {
    await deleteRow(row.id);
    throw limitReached(limit);
  }

  if (mode === "manual") return toView(row, 0);

  try {
    return toView(
      await saveCheck(row, state, await checkVercelDomain(hostname), mode),
      0,
    );
  } catch (error) {
    const failure = providerError(error, hostname, "addDomain");
    if (failure.status === 502) {
      // Keep the claim; "Verify" finishes adding it to the project.
      const [saved] = await db
        .update(customDomain)
        .set({
          verification: {
            ...state,
            message:
              "We couldn't finish setting up this domain. Click Verify to try again.",
          },
        })
        .where(eq(customDomain.id, row.id))
        .returning();
      return toView(saved ?? row, 0);
    }
    await deleteRow(row.id);
    await removeVercelProjectDomain(hostname).catch(() => undefined);
    throw failure;
  }
}

/** Re-checks DNS. Pending domains need Pro; verified ones only refresh their records. */
export async function verifyDomain(
  scope: ActiveScope,
  id: string,
): Promise<CustomDomainView> {
  const mode = requireMode();
  assertCanManage(scope);
  const row = await findInScope(scope, id);
  if (!row.verified) await domainLimit(scope);

  const state = readState(row.verification);
  let next = state;
  let check: DomainCheck;
  if (mode === "manual") {
    const token =
      state.mode === "manual" && state.token
        ? state.token
        : createVerificationToken();
    next = { ...state, token };
    check = await checkManualDomain(row.hostname, token);
  } else {
    try {
      check = await checkVercelDomain(row.hostname);
    } catch (error) {
      throw providerError(error, row.hostname, "verifyDomain");
    }
  }

  const saved = await saveCheck(row, next, check, mode);
  const counts = await codeCounts([saved.id]);
  return toView(saved, counts.get(saved.id) ?? 0);
}

/** Removes the domain; its codes fall back to the default short link. */
export async function removeDomain(
  scope: ActiveScope,
  id: string,
): Promise<{ id: string; hostname: string }> {
  const mode = requireMode();
  assertCanManage(scope);
  const row = await findInScope(scope, id);

  if (mode === "vercel") {
    try {
      await removeVercelProjectDomain(row.hostname);
    } catch (error) {
      throw providerError(error, row.hostname, "removeDomain");
    }
  }
  await db
    .delete(customDomain)
    .where(and(eq(customDomain.id, row.id), scopeWhere(scope)));
  return { id: row.id, hostname: row.hostname };
}
