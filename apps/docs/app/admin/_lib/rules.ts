// Pure rules behind the admin panel's support tools: search parsing, the
// sign-in method guard, import job repair and a few display helpers. No
// database or network here, so tests/admin covers them directly.

import { z } from "zod";
import type { ImportJob, JobItem } from "@/lib/migrate/types";

// ─── Reasons ─────────────────────────────────────────────────────────────────

/** Support actions must say why; the reason is stored in the audit log. */
export const requiredReason = z
  .string()
  .trim()
  .min(3, "Add a reason (at least 3 characters).")
  .max(500, "Keep the reason under 500 characters.");

/** Quick triage actions (dismissing a report, ...) may skip the reason. */
export const optionalReason = z
  .string()
  .trim()
  .max(500, "Keep the reason under 500 characters.")
  .optional()
  .transform((value) => value || undefined);

export const adminId = z.string().trim().min(1).max(128);

// ─── Sign-in methods ─────────────────────────────────────────────────────────

/**
 * A linked sign-in account (GitHub, Google, ...) may be unlinked only while
 * another one stays, matching Better Auth's own FAILED_TO_UNLINK_LAST_ACCOUNT
 * rule: support never leaves a user to rely on email codes alone.
 */
export function canUnlinkSignInMethod(
  accounts: readonly { id: string }[],
  accountId: string,
): { ok: true } | { ok: false; error: string } {
  if (!accounts.some((account) => account.id === accountId)) {
    return { ok: false, error: "That sign-in method is not linked." };
  }
  if (accounts.length <= 1) {
    return {
      ok: false,
      error: "This is the user's last sign-in method; it can't be unlinked.",
    };
  }
  return { ok: true };
}

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  credential: "Password",
  "email-otp": "Email code",
};

export const signInMethodLabel = (providerId: string) =>
  PROVIDER_LABELS[providerId] ?? providerId;

// ─── Global search ───────────────────────────────────────────────────────────

export const SEARCH_KINDS = ["user", "code", "page", "team", "app"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface ParsedSearch {
  /** The text to match, without a kind prefix */
  term: string;
  /** Result groups to search */
  kinds: SearchKind[];
  /** A short-link slug read from a pasted link (/q/<slug>, /p/<slug>) */
  slug: string | null;
  /** True when the term looks like an email address */
  email: boolean;
  /** True when the term is an OAuth client id */
  clientId: boolean;
}

const PREFIXES: Record<string, SearchKind[]> = {
  user: ["user"],
  email: ["user"],
  code: ["code"],
  slug: ["code", "page"],
  page: ["page"],
  team: ["team"],
  app: ["app"],
  client: ["app"],
};

export const SEARCH_MAX_LENGTH = 200;
const CLIENT_ID = /^qrdx_app_[0-9a-f]{8,64}$/i;
const SLUG = /^[0-9A-Za-z_-]{1,64}$/;

/** The slug in `/q/<slug>`, `/p/<slug>` or a pasted short link, if any. */
function slugFromLink(term: string): { slug: string; path: "q" | "p" } | null {
  let path = term;
  if (/^https?:\/\//i.test(term)) {
    try {
      path = new URL(term).pathname;
    } catch {
      return null;
    }
  }
  const match = path.match(/^\/?(q|p)\/([^/?#\s]+)\/?$/);
  if (!(match?.[1] && match[2] && SLUG.test(match[2]))) return null;
  return { slug: match[2], path: match[1] as "q" | "p" };
}

/**
 * Reads the admin search box. `kind:term` limits the groups (user, email,
 * code, slug, page, team, app, client); a pasted short link searches its
 * slug; a client id only searches apps. Null for an empty query.
 */
export function parseAdminSearch(
  raw: string | null | undefined,
): ParsedSearch | null {
  let term = (raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
  if (!term) return null;

  let kinds: SearchKind[] | null = null;
  const prefixed = term.match(/^([a-z]+):\s*(.*)$/i);
  const prefix = prefixed?.[1]?.toLowerCase();
  if (prefix && PREFIXES[prefix]) {
    kinds = PREFIXES[prefix];
    term = (prefixed?.[2] ?? "").trim();
    if (!term) return null;
  }

  const link = slugFromLink(term);
  const clientId = CLIENT_ID.test(term);
  const email = !link && term.includes("@");

  if (!kinds) {
    if (clientId) kinds = ["app"];
    else if (link)
      kinds = link.path === "p" ? ["page", "code"] : ["code", "page"];
    else if (email) kinds = ["user"];
    else kinds = [...SEARCH_KINDS];
  }

  return { term, kinds, slug: link?.slug ?? null, email, clientId };
}

// ─── Import jobs ─────────────────────────────────────────────────────────────

/** A running import nobody has advanced for this long counts as stuck. */
export const STUCK_IMPORT_MS = 30 * 60_000;

export function isStuckImport(
  job: Pick<ImportJob, "status" | "updatedAt">,
  now: Date = new Date(),
): boolean {
  if (job.status !== "running") return false;
  const updated = Date.parse(job.updatedAt);
  return Number.isFinite(updated) && now.getTime() - updated > STUCK_IMPORT_MS;
}

const firstPending = (items: JobItem[]) => {
  const index = items.findIndex((item) => item.status === "pending");
  return index === -1 ? items.length : index;
};

/**
 * Puts failed links back in the queue (and keeps everything already
 * created), so the user's import dialog picks the job up and runs it again.
 */
export function requeueImportJob(job: ImportJob, now: Date): ImportJob {
  const items = job.items.map((item): JobItem => {
    if (item.status !== "failed") return item;
    const { reason: _reason, ...rest } = item;
    return { ...rest, status: "pending" };
  });
  const cursor = firstPending(items);
  return {
    ...job,
    items,
    cursor,
    status: cursor >= items.length ? "done" : "running",
    updatedAt: now.toISOString(),
  };
}

export const CANCELED_IMPORT_REASON = "Canceled by QRdx support";

/** Stops a job: links still waiting are marked failed, nothing is deleted. */
export function cancelImportJob(job: ImportJob, now: Date): ImportJob {
  return {
    ...job,
    items: job.items.map(
      (item): JobItem =>
        item.status === "pending"
          ? { ...item, status: "failed", reason: CANCELED_IMPORT_REASON }
          : item,
    ),
    cursor: job.items.length,
    status: "done",
    updatedAt: now.toISOString(),
  };
}

// ─── Billing ─────────────────────────────────────────────────────────────────

/**
 * The customer's page in the Polar dashboard. Without the organization slug
 * (no valid token) it falls back to the dashboard home.
 */
export function polarCustomerUrl({
  customerId,
  organizationSlug,
  sandbox,
}: {
  customerId: string;
  organizationSlug: string | null;
  sandbox: boolean;
}): string {
  const origin = sandbox ? "https://sandbox.polar.sh" : "https://polar.sh";
  if (!organizationSlug) return `${origin}/dashboard`;
  return `${origin}/dashboard/${encodeURIComponent(organizationSlug)}/customers/${encodeURIComponent(customerId)}`;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

/** Better Auth's default invitation lifetime (organization plugin). */
export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

/** A resent invitation that already expired gets a fresh 48 hours. */
export function resentInvitationExpiry(expiresAt: Date, now: Date): Date {
  return expiresAt.getTime() > now.getTime() + 60 * 60 * 1000
    ? expiresAt
    : new Date(now.getTime() + INVITATION_TTL_MS);
}

// ─── Typed confirmation ──────────────────────────────────────────────────────

/** Deleting an account needs its exact email typed back (case-insensitive). */
export const confirmsEmail = (typed: string, email: string) =>
  typed.trim().toLowerCase() === email.trim().toLowerCase() &&
  email.trim().length > 0;
