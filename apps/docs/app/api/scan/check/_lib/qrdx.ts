import "server-only";

import {
  abuseReport,
  customDomain,
  database as db,
  qrCode,
} from "@repo/database";
import { and, eq, inArray } from "drizzle-orm";
import type {
  QrdxCodeInfo,
  QrdxCodeStatus,
} from "@/components/scanner/link-check";
import { baseUrl } from "@/lib/metadata";
import { type RedirectCode, redirectCodeColumns } from "@/lib/redirect/code";
import { evaluateLifecycle } from "@/lib/redirect/lifecycle";
import { isValidSlug, SHORT_LINK_BASE } from "@/lib/short-links";
import type { InternalHop } from "./resolve";

/** Hosts that serve `/q/<slug>` and `/p/<slug>` for every code. */
const OWN_HOSTS: ReadonlySet<string> = new Set(
  [
    "qrdx.dev",
    "www.qrdx.dev",
    baseUrl.hostname,
    new URL(SHORT_LINK_BASE).hostname,
  ].map((host) => host.toLowerCase()),
);

const OWN_PATH = /^\/(q|p)\/([0-9A-Za-z]{7})\/?$/;
const CUSTOM_PATH = /^\/(?:(p)\/)?([0-9A-Za-z]{7})\/?$/;

interface LinkTarget {
  slug: string;
  isPage: boolean;
  /** Custom domain id the code must belong to; null on QRdx's own hosts. */
  domainId: string | null;
}

async function linkTarget(url: URL): Promise<LinkTarget | null> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (OWN_HOSTS.has(host)) {
    const match = OWN_PATH.exec(url.pathname);
    if (!match || !isValidSlug(match[2] as string)) return null;
    return {
      slug: match[2] as string,
      isPage: match[1] === "p",
      domainId: null,
    };
  }
  const match = CUSTOM_PATH.exec(url.pathname);
  if (!match || !isValidSlug(match[2] as string)) return null;
  let domain: { id: string } | undefined;
  try {
    [domain] = await db
      .select({ id: customDomain.id })
      .from(customDomain)
      .where(
        and(eq(customDomain.hostname, host), eq(customDomain.verified, true)),
      )
      .limit(1);
  } catch (error) {
    // Treated as an ordinary website; the chain is then followed over HTTP.
    console.error("[scan-check] custom domain lookup failed:", error);
    return null;
  }
  return domain
    ? {
        slug: match[2] as string,
        isPage: match[1] === "p",
        domainId: domain.id,
      }
    : null;
}

function hasRules(routing: unknown): boolean {
  if (Array.isArray(routing)) return routing.length > 0;
  if (routing && typeof routing === "object") {
    const rules = (routing as { rules?: unknown }).rules;
    if (Array.isArray(rules)) return rules.length > 0;
    return Object.keys(routing).length > 0;
  }
  return false;
}

async function hasOpenReports(codeId: string): Promise<boolean> {
  const [report] = await db
    .select({ id: abuseReport.id })
    .from(abuseReport)
    .where(
      and(
        eq(abuseReport.qrCodeId, codeId),
        inArray(abuseReport.status, ["open", "actioned"]),
      ),
    )
    .limit(1);
  return Boolean(report);
}

/**
 * Resolves QRdx short links and hosted pages from the database instead of
 * requesting them, so a link check never counts as a scan, never runs routing
 * rules and never reveals a password-protected destination.
 */
export function createQrdxResolver() {
  let info: QrdxCodeInfo | null = null;
  const codes = new Map<string, Promise<RedirectCode | null>>();
  const reports = new Map<string, Promise<boolean>>();

  const isReported = (codeId: string) => {
    let pending = reports.get(codeId);
    if (!pending) {
      pending = hasOpenReports(codeId);
      reports.set(codeId, pending);
    }
    return pending;
  };

  const loadCode = (slug: string) => {
    let pending = codes.get(slug);
    if (!pending) {
      pending = db
        .select(redirectCodeColumns)
        .from(qrCode)
        .where(eq(qrCode.slug, slug))
        .limit(1)
        .then(([code]) => code ?? null);
      codes.set(slug, pending);
    }
    return pending;
  };

  const record = (next: QrdxCodeInfo) => {
    // The first QRdx code in the chain is the one the person scanned.
    info ??= next;
  };

  async function resolveInternal(url: URL): Promise<InternalHop | null> {
    const target = await linkTarget(url);
    if (!target) return null;
    try {
      return await resolveTarget(url, target);
    } catch (error) {
      // Fail closed: without the code we can't know what it may reveal.
      console.error("[scan-check] QRdx code lookup failed:", error);
      return { next: null, hidden: true };
    }
  }

  async function resolveTarget(
    url: URL,
    target: LinkTarget,
  ): Promise<InternalHop> {
    const code = await loadCode(target.slug);
    const base = {
      slug: target.slug,
      kind: code?.kind ?? "redirect",
      hasRules: hasRules(code?.routing),
    } as const;
    const finish = (status: QrdxCodeStatus, verified: boolean) =>
      record({ ...base, status, verified });

    if (!code || (target.domainId && code.domainId !== target.domainId)) {
      finish("not-found", false);
      return { next: null };
    }
    if (!code.isActive || code.archivedAt || code.deletedAt) {
      finish("inactive", false);
      return { next: null };
    }

    const verified = !(await isReported(code.id));
    // Never reveal a gated destination, even if the lifecycle check says otherwise.
    if (code.passwordHash) {
      finish("password", verified);
      return { next: null, hidden: true };
    }

    let lifecycle: Awaited<ReturnType<typeof evaluateLifecycle>>;
    try {
      lifecycle = await evaluateLifecycle(
        code,
        new Request(url.toString(), { method: "GET" }),
      );
    } catch (error) {
      console.error("[scan-check] lifecycle check failed:", error);
      finish("active", verified);
      return { next: null, hidden: true };
    }
    if (lifecycle.action === "gate") {
      finish("password", verified);
      return { next: null, hidden: true };
    }
    if (lifecycle.action === "ended") {
      finish("ended", verified);
      return { next: lifecycle.fallbackUrl };
    }

    finish("active", verified);
    if (target.isPage) return { next: null };
    if (code.kind === "page") {
      return { next: new URL(`/p/${code.slug}`, url).toString() };
    }
    return { next: code.destinationUrl };
  }

  return { resolveInternal, getInfo: () => info };
}
