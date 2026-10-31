// Shapes shared by the import dialog, the API routes and the importer.
// Client-safe (zod + types only).

import { z } from "zod";
import {
  API_PROVIDER_IDS,
  type ApiProviderId,
  FILE_PROVIDER_IDS,
  type ProviderId,
} from "./providers";

/** Links per import job (one dialog run); larger accounts import in passes. */
export const MAX_JOB_LINKS = 1000;
/** Codes created per request. */
export const IMPORT_CHUNK_SIZE = 50;
/** Old links re-pointed per request (providers rate-limit edits). */
export const REDIRECT_CHUNK_SIZE = 20;

/** A link or code in the provider's account, normalized. */
export interface SourceLink {
  /** Provider's id for the link (Dub "link_…", Bitly "bit.ly/abc", …) */
  id: string;
  /** Full old short link, e.g. https://bit.ly/3AbCdEf (null when unknown) */
  shortLink: string | null;
  /** Host of the short link, lower case */
  domain: string | null;
  /** Path after the domain, e.g. "3AbCdEf" */
  backHalf: string | null;
  destinationUrl: string;
  title: string | null;
  tags: string[];
  /** null when the provider doesn't return clicks with the list */
  clicks: number | null;
  /** ISO date the link was created in the provider */
  createdAt: string | null;
  archived: boolean;
}

export interface LinkFilters {
  search?: string;
  domain?: string;
  tag?: string;
}

export interface LinkPage {
  links: SourceLink[];
  /** Pass back for the next page; null = last page */
  nextCursor: string | null;
  /** Total matching links when the provider says */
  total: number | null;
}

/**
 * What the importer needs from a provider. Adapters wrap the integration
 * clients in packages/integrations.
 */
export interface MigrationSource {
  provider: ApiProviderId;
  /** Short-link domains of the account (hostnames, lower case) */
  listDomains?(): Promise<string[]>;
  listLinks(cursor: string | null, filters: LinkFilters): Promise<LinkPage>;
  /** Current state of one link (for undo records); optional */
  getLink?(id: string): Promise<SourceLink | null>;
  /** Points the old short link at `url` (only where the API allows it) */
  updateDestination?(id: string, url: string): Promise<void>;
}

/** Connection state of an API provider for the signed-in user. */
export interface ProviderStatus {
  id: ApiProviderId;
  /** active = ready; error = needs reconnecting; none = never connected */
  connection: "active" | "error" | "none";
  /** Connect with OAuth from the dialog */
  oauth: boolean;
  /** Connect by pasting a key or token in the dialog */
  apiKey: {
    label: string;
    placeholder?: string;
    helpUrl?: string;
    helpText?: string;
  } | null;
  /** The integration exists in this build */
  available: boolean;
}

/** GET /api/migrate/providers */
export interface ProvidersInfo {
  providers: ProviderStatus[];
  usage: {
    plan: string;
    limit: number | null;
    used: number;
    remaining: number | null;
  };
  domains: {
    domains: { id: string; hostname: string }[];
    canUse: boolean;
    defaultHost: string;
  };
}

/** GET /api/migrate/[provider]/links */
export interface LinksResponse extends LinkPage {
  /** Account domains (first page, when asked) */
  domains: string[] | null;
  /** Source ids already imported here → their QRdx link */
  imported: Record<string, string>;
}

// ─── Requests ────────────────────────────────────────────────────────────────

const urlString = z.string().trim().min(1).max(4096);
const shortText = (max: number) => z.string().trim().max(max);

export const sourceLinkSchema = z.object({
  id: z.string().trim().min(1).max(300),
  shortLink: urlString.nullable(),
  domain: shortText(253).nullable(),
  backHalf: shortText(300).nullable(),
  // Empty is allowed: the plan reports it as a row without a destination.
  destinationUrl: z.string().trim().max(4096),
  title: shortText(500).nullable(),
  tags: z.array(shortText(100)).max(50),
  clicks: z.number().int().min(0).nullable(),
  createdAt: shortText(64).nullable(),
  archived: z.boolean(),
}) satisfies z.ZodType<SourceLink>;

export const providerIdSchema = z.enum([
  ...API_PROVIDER_IDS,
  ...FILE_PROVIDER_IDS,
]) as z.ZodType<ProviderId>;

export const importOptionsSchema = z.object({
  /** Folder for the new codes; null = no folder */
  folderName: z.string().trim().max(60).nullable(),
  /** Copy the provider's tags onto the new codes */
  carryTags: z.boolean(),
  /** Import links whose destination already has a QRdx code */
  includeDuplicates: z.boolean(),
  /** Keep back-halves of links on this (branded) domain as QRdx slugs */
  backHalfDomain: z.string().trim().toLowerCase().max(253).nullable(),
  /** Use the suggested back-half where the original can't be kept */
  useSuggestions: z.boolean(),
  /** Import only the first N importable links (plan limit) */
  limit: z.number().int().min(0).max(MAX_JOB_LINKS).nullable(),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const previewRequestSchema = z.object({
  provider: providerIdSchema,
  links: z.array(sourceLinkSchema).min(1).max(MAX_JOB_LINKS),
  options: importOptionsSchema,
});
export type PreviewRequest = z.infer<typeof previewRequestSchema>;

// ─── Preview ─────────────────────────────────────────────────────────────────

export type PlanStatus =
  | "create"
  | "already-imported"
  | "duplicate"
  | "invalid"
  | "over-limit";

export type BackHalfStatus =
  | "kept"
  | "not-on-domain"
  | "shape"
  | "reserved"
  | "taken"
  | "repeated";

export interface BackHalfPlan {
  status: BackHalfStatus;
  /** The slug the code will get (null = a random one) */
  slug: string | null;
  /** An available alternative when the original can't be kept */
  suggestion: string | null;
}

export interface CodeRef {
  id: string;
  shortLink: string;
  /** In the trash, archived or active */
  state: "active" | "archived" | "trash";
}

export interface PlannedItem {
  id: string;
  status: PlanStatus;
  /** Why the link is skipped or invalid, in plain words */
  reason: string | null;
  /** Existing code (already imported, or with the same destination) */
  existing: CodeRef | null;
  backHalf: BackHalfPlan | null;
}

export interface ImportPreview {
  provider: ProviderId;
  total: number;
  /** Codes that will be created (after the limit) */
  creates: number;
  alreadyImported: number;
  duplicates: number;
  invalid: number;
  overLimit: number;
  /** Folder the codes go into (created if missing); null = none */
  folderName: string | null;
  /** Tags carried over that don't exist yet / already exist */
  newTags: string[];
  existingTags: string[];
  /** Free active-code slots; null = unlimited */
  remaining: number | null;
  /** Creates before the limit was applied */
  wanted: number;
  /** Back-halves: domain status, kept/conflict counts */
  backHalves: {
    domain: string;
    /** QRdx domain state for that hostname */
    qrdx: "verified" | "pending" | "missing";
    canUse: boolean;
    kept: number;
    conflicts: number;
  } | null;
  /** Domains seen in the selection that a customer could own */
  brandedDomains: string[];
  items: PlannedItem[];
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobItemStatus = "pending" | "created" | "skipped" | "failed";

export interface RedirectState {
  /** Destination before QRdx changed it (restored by undo) */
  previousUrl: string;
  updatedAt: string;
  undoneAt?: string;
  error?: string;
}

export interface JobItem {
  key: string;
  shortLink: string | null;
  /** Original destination */
  url: string;
  title: string | null;
  tags: string[];
  createdAt: string | null;
  /** Slug to claim (kept or suggested back-half); null = random */
  slug: string | null;
  status: JobItemStatus;
  reason?: string;
  codeId?: string;
  newLink?: string;
  /** Created, but notes/folder/tags/slug not applied yet (crash recovery) */
  unfinished?: boolean;
  redirect?: RedirectState;
  redirectError?: string;
}

export interface ImportJob {
  id: string;
  provider: ProviderId;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
  status: "running" | "done";
  options: ImportOptions;
  /** Index of the next item to process */
  cursor: number;
  items: JobItem[];
  domainAttachedAt?: string;
}

export interface JobSummary {
  id: string;
  provider: ProviderId;
  createdAt: string;
  status: ImportJob["status"];
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  redirected: number;
  undone: number;
  backHalfDomain: string | null;
  domainAttachedAt: string | null;
}

export interface ChunkResult {
  job: JobSummary;
  /** Items handled by this request */
  items: JobItem[];
  done: boolean;
}

export const startJobSchema = previewRequestSchema;

export const redirectRequestSchema = z.object({
  mode: z.enum(["dry-run", "apply", "undo"]),
});
export type RedirectMode = z.infer<typeof redirectRequestSchema>["mode"];

export interface RedirectPlanItem {
  key: string;
  shortLink: string | null;
  from: string;
  to: string;
}

export interface RedirectResult {
  mode: RedirectMode;
  /** Links handled by this request */
  items: (RedirectPlanItem & { ok: boolean; error?: string })[];
  /** Links still to do in this mode (0 = finished) */
  remaining: number;
  job: JobSummary;
  /** Set when the provider refused for a plan or quota reason; stops the run */
  stopped: string | null;
}
