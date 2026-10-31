import "server-only";

import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { env } from "@/lib/env";
import { baseUrl } from "@/lib/metadata";

/**
 * How custom domains are connected on this deployment:
 * - "vercel": added to the Vercel project through the Domains API
 *   (VERCEL_API_TOKEN + VERCEL_PROJECT_ID).
 * - "manual": self-hosted; the owner routes the domain to this server and
 *   proves ownership with a TXT record we check over DNS.
 * - "disabled": on Vercel without API access. Vercel only routes domains that
 *   were added to the project, so nothing could ever reach this app.
 */
export type CustomDomainMode = "vercel" | "manual" | "disabled";

export function getCustomDomainMode(): CustomDomainMode {
  if (env.VERCEL_API_TOKEN && env.VERCEL_PROJECT_ID) return "vercel";
  return process.env.VERCEL ? "disabled" : "manual";
}

export interface DnsRecord {
  type: "A" | "CNAME" | "TXT";
  /** Fully qualified record name */
  name: string;
  value: string;
  note?: string;
}

export interface DomainCheck {
  /** DNS proves ownership and (on Vercel) points at the project */
  verified: boolean;
  records: DnsRecord[];
  /** Registrable domain when the provider knows it (for relative record names) */
  apexName: string | null;
  /** What is still missing, in plain words; null once verified */
  message: string | null;
}

const PROPAGATION_HINT =
  "DNS changes usually show up within minutes, but can take up to 48 hours.";

// ─── Vercel Domains API ──────────────────────────────────────────────────────
// https://vercel.com/docs/rest-api (projects/*-domain*, domains/get-a-domain-s-configuration)

const VERCEL_API = "https://api.vercel.com";
const VERCEL_TIMEOUT_MS = 10_000;
const VERCEL_DEFAULT_A = "76.76.21.21";
const VERCEL_DEFAULT_CNAME = "cname.vercel-dns.com";

interface VercelChallenge {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

interface VercelProjectDomain {
  name: string;
  apexName: string;
  verified: boolean;
  verification?: VercelChallenge[];
}

interface VercelDomainConfig {
  configuredBy: string | null;
  misconfigured: boolean;
  recommendedIPv4?: { rank: number; value: string[] }[];
  recommendedCNAME?: { rank: number; value: string }[];
}

export class VercelApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "VercelApiError";
    this.status = status;
    this.code = code;
  }
}

function vercelProject() {
  const token = env.VERCEL_API_TOKEN;
  const projectId = env.VERCEL_PROJECT_ID;
  if (!(token && projectId)) {
    throw new Error("The Vercel Domains API is not configured");
  }
  return { token, projectId, teamId: env.VERCEL_TEAM_ID };
}

async function vercelRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  { body, query }: { body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const { token, teamId } = vercelProject();
  const url = new URL(path, VERCEL_API);
  if (teamId) url.searchParams.set("teamId", teamId);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(VERCEL_TIMEOUT_MS),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body; handled below.
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } })
      ?.error;
    throw new VercelApiError(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? `Vercel API responded with ${response.status}`,
    );
  }
  return data as T;
}

const projectDomainsPath = (hostname?: string) => {
  const { projectId } = vercelProject();
  const base = `/projects/${encodeURIComponent(projectId)}/domains`;
  return hostname ? `${base}/${encodeURIComponent(hostname)}` : base;
};

const isNotFound = (error: unknown) =>
  error instanceof VercelApiError && error.status === 404;

/** The domain on our Vercel project, or null when it isn't there. */
export async function getVercelProjectDomain(
  hostname: string,
): Promise<VercelProjectDomain | null> {
  try {
    return await vercelRequest<VercelProjectDomain>(
      "GET",
      `/v9${projectDomainsPath(hostname)}`,
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function addVercelProjectDomain(
  hostname: string,
): Promise<VercelProjectDomain> {
  return vercelRequest<VercelProjectDomain>(
    "POST",
    `/v10${projectDomainsPath()}`,
    { body: { name: hostname } },
  );
}

/** Removes the domain from the project; already-gone domains count as removed. */
export async function removeVercelProjectDomain(
  hostname: string,
): Promise<void> {
  try {
    await vercelRequest("DELETE", `/v9${projectDomainsPath(hostname)}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function pickRanked<T extends { rank: number }>(
  options: T[] | undefined,
): T | undefined {
  return [...(options ?? [])].sort((a, b) => a.rank - b.rank)[0];
}

/**
 * Brings the project domain up to date: re-adds it when it went missing,
 * retries the ownership challenge, and reads the DNS configuration.
 */
export async function checkVercelDomain(hostname: string): Promise<DomainCheck> {
  let domain =
    (await getVercelProjectDomain(hostname)) ??
    (await addVercelProjectDomain(hostname));

  if (!domain.verified) {
    try {
      const result = await vercelRequest<VercelProjectDomain>(
        "POST",
        `/v9${projectDomainsPath(hostname)}/verify`,
      );
      // The verify response has no `verification` list; keep the challenge.
      domain = { ...domain, ...result };
    } catch (error) {
      // 400 = the challenge isn't satisfied yet.
      if (!(error instanceof VercelApiError && error.status === 400)) {
        throw error;
      }
    }
  }

  const { projectId } = vercelProject();
  const config = await vercelRequest<VercelDomainConfig>(
    "GET",
    `/v6/domains/${encodeURIComponent(hostname)}/config`,
    { query: { projectIdOrName: projectId } },
  );

  const records: DnsRecord[] = [];
  if (domain.apexName === hostname) {
    records.push({
      type: "A",
      name: hostname,
      value: pickRanked(config.recommendedIPv4)?.value[0] ?? VERCEL_DEFAULT_A,
    });
  } else {
    records.push({
      type: "CNAME",
      name: hostname,
      value: (
        pickRanked(config.recommendedCNAME)?.value ?? VERCEL_DEFAULT_CNAME
      ).replace(/\.$/, ""),
    });
  }
  if (!domain.verified) {
    for (const challenge of domain.verification ?? []) {
      if (challenge.type === "TXT") {
        records.push({
          type: "TXT",
          name: challenge.domain,
          value: challenge.value,
          note: "Proves you own the domain.",
        });
      }
    }
  }

  const verified = domain.verified && !config.misconfigured;
  let message: string | null = null;
  if (!domain.verified) {
    message = `Add the TXT record below so we can confirm you own ${hostname}. ${PROPAGATION_HINT}`;
  } else if (config.misconfigured) {
    message = `${hostname} doesn't point to QRdx yet. Add the ${records[0]?.type} record below. ${PROPAGATION_HINT}`;
  }
  return { verified, records, apexName: domain.apexName ?? null, message };
}

// ─── Manual verification (self-hosted) ───────────────────────────────────────

const MANUAL_CHALLENGE_LABEL = "_qrdx-challenge";

// Short timeouts: the check runs inside a server action.
const resolver = new Resolver({ timeout: 4000, tries: 2 });

export function createVerificationToken(): string {
  return randomBytes(16).toString("hex");
}

/** TXT record that proves ownership, plus a hint for routing the domain here. */
export function manualRecords(hostname: string, token: string): DnsRecord[] {
  return [
    {
      type: "TXT",
      name: `${MANUAL_CHALLENGE_LABEL}.${hostname}`,
      value: `qrdx-verify=${token}`,
      note: "Proves you own the domain.",
    },
    {
      type: "CNAME",
      name: hostname,
      value: baseUrl.hostname,
      note: "Routes scans to this server. An A record with your server's IP works too; your reverse proxy must forward the original Host header.",
    },
  ];
}

/** Looks up the ownership TXT record over DNS. */
export async function checkManualDomain(
  hostname: string,
  token: string,
): Promise<DomainCheck> {
  const records = manualRecords(hostname, token);
  const challenge = records[0] as DnsRecord;
  const result = (message: string | null, verified = false): DomainCheck => ({
    verified,
    records,
    apexName: null,
    message,
  });

  let values: string[];
  try {
    const txt = await resolver.resolveTxt(challenge.name);
    values = txt.map((chunks) => chunks.join("").trim());
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENODATA" && code !== "ENOTFOUND") {
      return result(
        "We couldn't look up DNS right now. Please try again in a minute.",
      );
    }
    values = [];
  }

  if (values.includes(challenge.value)) return result(null, true);
  return result(
    values.length > 0
      ? `Found a TXT record at ${challenge.name}, but its value doesn't match. ${PROPAGATION_HINT}`
      : `No TXT record at ${challenge.name} yet. ${PROPAGATION_HINT}`,
  );
}
