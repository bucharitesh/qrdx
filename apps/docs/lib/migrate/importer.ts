// The import service: preview, resumable chunked import, redirects of old
// links (with undo) and attaching kept back-halves to a custom domain.
// Everything that touches the database or a provider comes in through
// `ImporterDeps`, so the tests run it against in-memory fakes.

import { explainProviderError } from "./adapters";
import {
  applyChunk,
  applyRedirects,
  clearRedirectErrors,
  createJob,
  nextChunk,
  redirectBatch,
  redirectPlanItem,
  redirectTargets,
  summarizeJob,
  upsertJob,
} from "./jobs";
import { buildImportNotes, splitShortLink } from "./normalize";
import {
  type DestinationCheck,
  type ImportPlan,
  jobItemsFromPlan,
  planImport,
  slugCandidates,
} from "./plan";
import { isApiProviderId } from "./providers";
import type {
  ChunkResult,
  CodeRef,
  ImportJob,
  ImportPreview,
  JobItem,
  JobSummary,
  MigrationSource,
  PreviewRequest,
  RedirectMode,
  RedirectResult,
} from "./types";
import { IMPORT_CHUNK_SIZE } from "./types";

export interface Scope {
  userId: string;
  organizationId: string | null;
}

/** Thrown for problems the user should see (status + safe message). */
export class ImportError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export interface CreateInput {
  destinationUrl: string;
  title: string | null;
  domainId: string | null;
}

export interface CreatedCode {
  id: string;
  slug: string;
  shortLink: string;
}

export interface FinishInput {
  codeId: string;
  notes: string;
  folderName: string | null;
  tags: string[];
  slug: string | null;
}

export interface MigrateRepo {
  usage(scope: Scope): Promise<{ remaining: number | null; bulk: boolean }>;
  /** Codes imported from `provider` (all of them, or only `keys`) by source id */
  findImported(
    scope: Scope,
    provider: string,
    keys?: string[],
  ): Promise<Map<string, CodeRef>>;
  /** Workspace codes by destinationKey() of the given URLs */
  findByDestinations(scope: Scope, urls: string[]): Promise<Map<string, CodeRef>>;
  findTakenSlugs(slugs: string[]): Promise<Set<string>>;
  existingTagNames(scope: Scope): Promise<Set<string>>;
  /** The workspace's QRdx custom domain with this hostname */
  domainFor(
    scope: Scope,
    hostname: string,
  ): Promise<{
    id: string | null;
    qrdx: "verified" | "pending" | "missing";
    canUse: boolean;
  }>;
  qrdxHosts(scope: Scope): Promise<Set<string>>;
  checkDestination(url: string): DestinationCheck;
  /** Plan limits, safety screening and events apply (throws on failure) */
  createCodes(scope: Scope, inputs: CreateInput[]): Promise<CreatedCode[]>;
  /** Notes, folder, tags and slug of new codes; returns the final link per code */
  finishCodes(
    scope: Scope,
    rows: FinishInput[],
  ): Promise<Map<string, { shortLink: string; warning?: string }>>;
  /** Codes of the workspace among `ids` (for redirect targets) */
  codesInScope(scope: Scope, ids: string[]): Promise<Set<string>>;
  attachDomain(scope: Scope, ids: string[], domainId: string): Promise<number>;
  loadJobs(userId: string): Promise<ImportJob[]>;
  saveJobs(userId: string, jobs: ImportJob[]): Promise<void>;
  /** Stops two requests from running the same chunk at once */
  claimChunk(jobId: string, cursor: number, mode: string): Promise<boolean>;
}

export interface ImporterDeps {
  repo: MigrateRepo;
  now: () => Date;
  newId: () => string;
}

// ─── Preview ─────────────────────────────────────────────────────────────────

async function buildPlan(
  deps: ImporterDeps,
  scope: Scope,
  request: PreviewRequest,
): Promise<ImportPlan> {
  const { repo } = deps;
  const { links, options, provider } = request;
  const backHalfDomain = options.backHalfDomain;
  const { slugs, candidates } = slugCandidates(links, options);
  const [usage, imported, byDestination, takenSlugs, existingTags, domain, hosts] =
    await Promise.all([
      repo.usage(scope),
      repo.findImported(scope, provider),
      repo.findByDestinations(
        scope,
        links.map((link) => link.destinationUrl),
      ),
      repo.findTakenSlugs(slugs),
      repo.existingTagNames(scope),
      backHalfDomain ? repo.domainFor(scope, backHalfDomain) : null,
      repo.qrdxHosts(scope),
    ]);

  return planImport(links, {
    provider,
    options,
    imported,
    byDestination,
    takenSlugs,
    candidates,
    remaining: usage.remaining,
    existingTags,
    backHalfDomain: domain,
    checkDestination: (url) => repo.checkDestination(url),
    qrdxHosts: hosts,
  });
}

export async function previewImport(
  deps: ImporterDeps,
  scope: Scope,
  request: PreviewRequest,
): Promise<ImportPreview> {
  return (await buildPlan(deps, scope, request)).preview;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

async function loadJob(deps: ImporterDeps, scope: Scope, id: string) {
  const jobs = await deps.repo.loadJobs(scope.userId);
  const job = jobs.find((entry) => entry.id === id);
  // Jobs of another workspace look missing (the record is per user).
  if (!job || job.organizationId !== scope.organizationId) {
    throw new ImportError(404, "NOT_FOUND", "Import not found.");
  }
  return { jobs, job };
}

async function saveJob(
  deps: ImporterDeps,
  scope: Scope,
  jobs: ImportJob[],
  job: ImportJob,
) {
  await deps.repo.saveJobs(scope.userId, upsertJob(jobs, job));
}

/** Plans again on the server (never trusting the client's preview) and records the job. */
export async function startJob(
  deps: ImporterDeps,
  scope: Scope,
  request: PreviewRequest,
): Promise<{ job: JobSummary; preview: ImportPreview }> {
  const plan = await buildPlan(deps, scope, request);
  if (plan.preview.creates === 0 && plan.preview.overLimit > 0) {
    throw new ImportError(
      402,
      "LIMIT_REACHED",
      "Your plan has no free active-code slots. Archive codes or upgrade to import.",
    );
  }
  const jobs = await deps.repo.loadJobs(scope.userId);
  const job = createJob({
    id: deps.newId(),
    provider: request.provider,
    organizationId: scope.organizationId,
    options: request.options,
    items: jobItemsFromPlan(plan),
    now: deps.now(),
  });
  await saveJob(deps, scope, jobs, job);
  return { job: summarizeJob(job), preview: plan.preview };
}

export async function listJobs(
  deps: ImporterDeps,
  scope: Scope,
): Promise<JobSummary[]> {
  const jobs = await deps.repo.loadJobs(scope.userId);
  return jobs
    .filter((job) => job.organizationId === scope.organizationId)
    .map(summarizeJob);
}

export async function getJob(
  deps: ImporterDeps,
  scope: Scope,
  id: string,
): Promise<{ job: JobSummary; items: JobItem[] }> {
  const { job } = await loadJob(deps, scope, id);
  return { job: summarizeJob(job), items: job.items };
}

const messageOf = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Not created";

/** Errors that will hit every row the same way: stop instead of failing rows. */
const isRunStopper = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ["RATE_LIMITED", "PLAN_REQUIRED", "LIMIT_REACHED", "UNAUTHORIZED"].includes(
    String((error as { code?: unknown }).code),
  );

/**
 * Creates the next chunk (≤ 50) of a job. Safe to retry: links already
 * imported (marker in the notes) are skipped, finished items are never redone.
 */
export async function runJobChunk(
  deps: ImporterDeps,
  scope: Scope,
  id: string,
): Promise<ChunkResult> {
  const { repo } = deps;
  const loaded = await loadJob(deps, scope, id);
  const { jobs } = loaded;
  let job = loaded.job;
  const unfinished = job.items.filter(
    (item) => item.status === "created" && item.unfinished,
  );
  if (job.status === "done" && unfinished.length === 0) {
    return { job: summarizeJob(job), items: [], done: true };
  }
  if (!(await repo.claimChunk(job.id, job.cursor, "import"))) {
    throw new ImportError(
      409,
      "BUSY",
      "This part of the import is already running. Wait a few seconds.",
      { "Retry-After": "5" },
    );
  }

  // A run that died between creating codes and finishing them left codes
  // without notes (no marker): finish those before creating anything else.
  if (unfinished.length > 0) {
    job = await finishItems(deps, scope, jobs, job, unfinished);
    return {
      job: summarizeJob(job),
      items: job.items.filter((item) =>
        unfinished.some((entry) => entry.key === item.key),
      ),
      done: job.status === "done",
    };
  }

  const indexes = nextChunk(job, IMPORT_CHUNK_SIZE);
  const chunk = indexes.map((index) => job.items[index] as JobItem);
  const results = new Map<string, Partial<JobItem>>();

  // Idempotency: a link imported by an earlier job or run is never redone.
  const imported = await repo.findImported(
    scope,
    job.provider,
    chunk.map((item) => item.key),
  );
  let todo: JobItem[] = [];
  for (const item of chunk) {
    const existing = imported.get(item.key);
    if (existing) {
      results.set(item.key, {
        status: "skipped",
        reason: "Already imported",
        codeId: existing.id,
        newLink: existing.shortLink,
      });
    } else {
      todo.push(item);
    }
  }

  const usage = await repo.usage(scope);
  if (usage.remaining !== null && todo.length > usage.remaining) {
    for (const item of todo.slice(usage.remaining)) {
      results.set(item.key, {
        status: "skipped",
        reason: "Over your plan's active-code limit",
      });
    }
    todo = todo.slice(0, usage.remaining);
  }

  const backHalfDomain = job.options.backHalfDomain;
  const domain = backHalfDomain
    ? await repo.domainFor(scope, backHalfDomain)
    : null;
  const domainIdFor = (item: JobItem) =>
    domain?.id &&
    domain.qrdx === "verified" &&
    domain.canUse &&
    splitShortLink(item.shortLink).domain === backHalfDomain
      ? domain.id
      : null;
  const input = (item: JobItem): CreateInput => ({
    destinationUrl: item.url,
    title: item.title,
    domainId: domainIdFor(item),
  });

  const created = new Map<string, CreatedCode>();
  if (todo.length > 0) {
    let stopped: unknown = null;
    if (usage.bulk && todo.length > 1) {
      try {
        const codes = await repo.createCodes(scope, todo.map(input));
        todo.forEach((item, index) => {
          const code = codes[index];
          if (code) created.set(item.key, code);
        });
        todo = [];
      } catch (error) {
        if (isRunStopper(error)) stopped = error;
        // Otherwise one bad row (an unsafe URL, …) fails the whole batch:
        // fall through and create one by one to isolate it.
      }
    }
    for (const item of todo) {
      if (stopped) break;
      try {
        const [code] = await repo.createCodes(scope, [input(item)]);
        if (code) created.set(item.key, code);
      } catch (error) {
        if (isRunStopper(error)) {
          stopped = error;
          break;
        }
        results.set(item.key, { status: "failed", reason: messageOf(error) });
      }
    }
    if (stopped && created.size === 0) {
      const code = String((stopped as { code?: unknown }).code);
      if (code === "RATE_LIMITED") throw stopped;
      // Plan problems: the rest of this chunk can't be created.
      for (const item of todo) {
        if (!results.has(item.key)) {
          results.set(item.key, {
            status: "failed",
            reason: messageOf(stopped),
          });
        }
      }
    }
  }

  for (const [key, code] of created) {
    results.set(key, {
      status: "created",
      codeId: code.id,
      newLink: code.shortLink,
      unfinished: true,
    });
  }
  // Record the new codes first, so a crash from here on can't duplicate them.
  job = applyChunk(job, results, deps.now());
  await saveJob(deps, scope, jobs, job);
  if (created.size > 0) {
    job = await finishItems(
      deps,
      scope,
      jobs,
      job,
      job.items.filter((item) => created.has(item.key)),
    );
  }
  return {
    job: summarizeJob(job),
    items: indexes.map((index) => job.items[index] as JobItem),
    done: job.status === "done",
  };
}

/** Notes (with the marker), folder, tags and kept back-half of created codes. */
async function finishItems(
  deps: ImporterDeps,
  scope: Scope,
  jobs: ImportJob[],
  job: ImportJob,
  items: JobItem[],
): Promise<ImportJob> {
  const importedAt = deps.now();
  const finished = await deps.repo.finishCodes(
    scope,
    items.flatMap((item) =>
      item.codeId
        ? [
            {
              codeId: item.codeId,
              notes: buildImportNotes({
                provider: job.provider,
                key: item.key,
                shortLink: item.shortLink,
                createdAt: item.createdAt,
                importedAt,
              }),
              folderName: job.options.folderName,
              tags: item.tags,
              slug: item.slug,
            },
          ]
        : [],
    ),
  );
  const keys = new Map(items.map((item) => [item.key, item]));
  const next: ImportJob = {
    ...job,
    updatedAt: importedAt.toISOString(),
    items: job.items.map((item) => {
      if (!(keys.has(item.key) && item.codeId)) return item;
      const final = finished.get(item.codeId);
      const { unfinished: _done, ...rest } = item;
      return {
        ...rest,
        newLink: final?.shortLink ?? item.newLink,
        ...(final?.warning && { reason: final.warning }),
      };
    }),
  };
  await saveJob(deps, scope, jobs, next);
  return next;
}

// ─── Redirects (keep printed codes working) ──────────────────────────────────

/**
 * Dry run lists every change. Apply points old links at their QRdx links and
 * records the previous destinations; undo puts those back. Both run in small
 * batches and stop on plan or quota errors.
 */
export async function runRedirects(
  deps: ImporterDeps,
  scope: Scope,
  id: string,
  mode: RedirectMode,
  source: MigrationSource | null,
): Promise<RedirectResult> {
  const { repo } = deps;
  const loaded = await loadJob(deps, scope, id);
  const { jobs } = loaded;
  let { job } = loaded;
  if (!isApiProviderId(job.provider)) {
    throw new ImportError(
      400,
      "NOT_SUPPORTED",
      "Old codes from a file import are re-pointed in the old provider. Use the steps and the mapping CSV.",
    );
  }
  if (mode === "dry-run") {
    const { items } = redirectBatch(clearRedirectErrors(job), mode);
    return {
      mode,
      items: items.map((item) => ({ ...redirectPlanItem(item, mode), ok: true })),
      remaining: 0,
      job: summarizeJob(job),
      stopped: null,
    };
  }
  if (!source?.updateDestination) {
    throw new ImportError(
      409,
      "NOT_CONNECTED",
      "Connect the account again to change its links.",
    );
  }
  // Progress so far in this mode: each batch claims a new key.
  const progress = job.items.filter((item) =>
    Boolean(
      item.redirectError ||
        (mode === "undo" ? item.redirect?.undoneAt : item.redirect),
    ),
  ).length;
  if (!(await repo.claimChunk(job.id, progress, `redirect-${mode}`))) {
    throw new ImportError(409, "BUSY", "Already running. Wait a few seconds.", {
      "Retry-After": "5",
    });
  }

  const { items } = redirectBatch(job, mode);
  // Only codes still in this workspace can receive the old links.
  const inScope = await repo.codesInScope(
    scope,
    items.flatMap((item) => (item.codeId ? [item.codeId] : [])),
  );

  const outcomes = new Map<
    string,
    { ok: boolean; previousUrl?: string; error?: string }
  >();
  let stopped: string | null = null;
  for (const item of items) {
    if (mode === "apply" && !(item.codeId && inScope.has(item.codeId))) {
      outcomes.set(item.key, {
        ok: false,
        error: "The QRdx code is no longer in this workspace.",
      });
      continue;
    }
    const plan = redirectPlanItem(item, mode);
    try {
      let previousUrl = item.url;
      if (mode === "apply" && source.getLink) {
        // Record what the link points to right now, not at import time.
        const current = await source.getLink(item.key).catch(() => null);
        if (current?.destinationUrl) previousUrl = current.destinationUrl;
      }
      await source.updateDestination(item.key, plan.to);
      outcomes.set(item.key, { ok: true, previousUrl });
    } catch (error) {
      const explained = explainProviderError(job.provider, error);
      if (explained.stop) {
        stopped = explained.message;
        break;
      }
      outcomes.set(item.key, { ok: false, error: explained.message });
    }
  }

  job = applyRedirects(job, mode, outcomes, deps.now());
  await saveJob(deps, scope, jobs, job);
  const remaining = redirectBatch(job, mode, Number.POSITIVE_INFINITY).items
    .length;
  return {
    mode,
    items: items
      .filter((item) => outcomes.has(item.key))
      .map((item) => {
        const outcome = outcomes.get(item.key);
        return {
          ...redirectPlanItem(item, mode),
          ok: Boolean(outcome?.ok),
          ...(outcome?.error && { error: outcome.error }),
        };
      }),
    remaining,
    job: summarizeJob(job),
    stopped,
  };
}

/** Lets links that failed before be tried again. */
export async function resetRedirectErrors(
  deps: ImporterDeps,
  scope: Scope,
  id: string,
): Promise<JobSummary> {
  const { jobs, job } = await loadJob(deps, scope, id);
  const next = clearRedirectErrors(job);
  await saveJob(deps, scope, jobs, next);
  return summarizeJob(next);
}

/** Old link → new QRdx link for every item that has one (mapping CSV). */
export async function jobMapping(
  deps: ImporterDeps,
  scope: Scope,
  id: string,
) {
  const { job } = await loadJob(deps, scope, id);
  return redirectTargets(job);
}

// ─── Branded domain ──────────────────────────────────────────────────────────

/** Moves codes with kept back-halves onto the verified QRdx custom domain. */
export async function attachJobDomain(
  deps: ImporterDeps,
  scope: Scope,
  id: string,
): Promise<{ attached: number; job: JobSummary }> {
  const { repo } = deps;
  const { jobs, job } = await loadJob(deps, scope, id);
  const hostname = job.options.backHalfDomain;
  if (!hostname) {
    throw new ImportError(400, "NO_DOMAIN", "This import kept no back-halves.");
  }
  const domain = await repo.domainFor(scope, hostname);
  if (!domain.canUse) {
    throw new ImportError(
      402,
      "PLAN_REQUIRED",
      "Custom domains are part of Pro and Business.",
    );
  }
  if (!(domain.id && domain.qrdx === "verified")) {
    throw new ImportError(
      400,
      "DOMAIN_NOT_VERIFIED",
      `Add ${hostname} on the Domains page and verify it first.`,
    );
  }
  const ids = job.items.flatMap((item) =>
    item.status === "created" &&
    item.codeId &&
    splitShortLink(item.shortLink).domain === hostname
      ? [item.codeId]
      : [],
  );
  const attached = ids.length
    ? await repo.attachDomain(scope, ids, domain.id)
    : 0;
  const next = { ...job, domainAttachedAt: deps.now().toISOString() };
  // New links: the slug on the custom domain.
  next.items = job.items.map((item) =>
    item.codeId && ids.includes(item.codeId) && item.newLink
      ? {
          ...item,
          newLink: `https://${hostname}/${item.newLink.split("/").pop() ?? ""}`,
        }
      : item,
  );
  await saveJob(deps, scope, jobs, next);
  return { attached, job: summarizeJob(next) };
}
