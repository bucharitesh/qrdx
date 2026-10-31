// Import jobs: the resumable record of one import (progress cursor, per-link
// results, and the original destinations needed to undo redirects). Pure;
// lib/migrate/server/records.ts stores them.

import { z } from "zod";
import type {
  ImportJob,
  ImportOptions,
  JobItem,
  JobSummary,
  RedirectMode,
  RedirectPlanItem,
} from "./types";
import {
  IMPORT_CHUNK_SIZE,
  importOptionsSchema,
  providerIdSchema,
  REDIRECT_CHUNK_SIZE,
} from "./types";

/** Jobs kept per user; older ones go, except those with live redirects. */
export const MAX_JOBS = 10;
const MAX_JOBS_HARD = 20;

const redirectSchema = z.object({
  previousUrl: z.string().max(4096),
  updatedAt: z.string().max(64),
  undoneAt: z.string().max(64).optional(),
  error: z.string().max(500).optional(),
});

const jobItemSchema = z.object({
  key: z.string().max(300),
  shortLink: z.string().max(4096).nullable(),
  url: z.string().max(4096),
  title: z.string().max(500).nullable(),
  tags: z.array(z.string().max(100)).max(50),
  createdAt: z.string().max(64).nullable(),
  slug: z.string().max(64).nullable(),
  status: z.enum(["pending", "created", "skipped", "failed"]),
  reason: z.string().max(500).optional(),
  codeId: z.string().max(64).optional(),
  newLink: z.string().max(4096).optional(),
  unfinished: z.boolean().optional(),
  redirect: redirectSchema.optional(),
  redirectError: z.string().max(500).optional(),
}) satisfies z.ZodType<JobItem>;

export const importJobSchema = z.object({
  id: z.string().max(64),
  provider: providerIdSchema,
  organizationId: z.string().max(64).nullable(),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
  status: z.enum(["running", "done"]),
  options: importOptionsSchema,
  cursor: z.number().int().min(0),
  items: z.array(jobItemSchema),
  domainAttachedAt: z.string().max(64).optional(),
}) satisfies z.ZodType<ImportJob>;

export const jobStoreSchema = z.object({
  v: z.literal(1),
  jobs: z.array(z.unknown()),
});

/** Jobs from stored metadata; unreadable entries are dropped, not fatal. */
export function readJobs(metadata: unknown): ImportJob[] {
  const store = jobStoreSchema.safeParse(metadata);
  if (!store.success) return [];
  return store.data.jobs.flatMap((job) => {
    const parsed = importJobSchema.safeParse(job);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createJob(input: {
  id: string;
  provider: ImportJob["provider"];
  organizationId: string | null;
  options: ImportOptions;
  items: JobItem[];
  now: Date;
}): ImportJob {
  const now = input.now.toISOString();
  const job: ImportJob = {
    id: input.id,
    provider: input.provider,
    organizationId: input.organizationId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    options: input.options,
    cursor: 0,
    items: input.items,
  };
  return advanceCursor(job);
}

/** Moves the cursor past items that need no work; marks the job done at the end. */
function advanceCursor(job: ImportJob): ImportJob {
  let cursor = job.cursor;
  while (cursor < job.items.length && job.items[cursor]?.status !== "pending") {
    cursor += 1;
  }
  return {
    ...job,
    cursor,
    status: cursor >= job.items.length ? "done" : "running",
  };
}

/** Indexes of the next chunk of pending items (empty when done). */
export function nextChunk(
  job: ImportJob,
  size: number = IMPORT_CHUNK_SIZE,
): number[] {
  const indexes: number[] = [];
  for (let i = job.cursor; i < job.items.length && indexes.length < size; i++) {
    if (job.items[i]?.status === "pending") indexes.push(i);
  }
  return indexes;
}

/** Writes a chunk's outcome into the job (by item key) and advances it. */
export function applyChunk(
  job: ImportJob,
  results: Map<string, Partial<JobItem>>,
  now: Date,
): ImportJob {
  const items = job.items.map((item) => {
    const patch = results.get(item.key);
    return patch && item.status === "pending" ? { ...item, ...patch } : item;
  });
  return advanceCursor({ ...job, items, updatedAt: now.toISOString() });
}

export function summarizeJob(job: ImportJob): JobSummary {
  const count = (fn: (item: JobItem) => boolean) =>
    job.items.reduce((total, item) => total + (fn(item) ? 1 : 0), 0);
  return {
    id: job.id,
    provider: job.provider,
    createdAt: job.createdAt,
    status: job.status,
    total: job.items.length,
    processed: count((item) => item.status !== "pending"),
    created: count((item) => item.status === "created"),
    skipped: count((item) => item.status === "skipped"),
    failed: count((item) => item.status === "failed"),
    redirected: count((item) =>
      Boolean(item.redirect && !item.redirect.undoneAt),
    ),
    undone: count((item) => Boolean(item.redirect?.undoneAt)),
    backHalfDomain: job.options.backHalfDomain,
    domainAttachedAt: job.domainAttachedAt ?? null,
  };
}

/** True while some old link points at QRdx because of this job. */
export const hasLiveRedirects = (job: ImportJob) =>
  job.items.some((item) => item.redirect && !item.redirect.undoneAt);

/** Drops details a finished job no longer needs (keeps mapping and undo data). */
export function compactJob(job: ImportJob): ImportJob {
  if (job.status !== "done") return job;
  return {
    ...job,
    // Unfinished items still need their tags (crash recovery).
    items: job.items.map((item) =>
      item.unfinished ? item : { ...item, title: null, tags: [] },
    ),
  };
}

/** Puts `job` first and keeps the store bounded (live-redirect jobs survive longer). */
export function upsertJob(jobs: ImportJob[], job: ImportJob): ImportJob[] {
  const others = jobs.filter((other) => other.id !== job.id);
  const ordered = [compactJob(job), ...others.map(compactJob)];
  const kept: ImportJob[] = [];
  for (const [index, entry] of ordered.entries()) {
    if (
      index < MAX_JOBS ||
      (hasLiveRedirects(entry) && kept.length < MAX_JOBS_HARD)
    ) {
      kept.push(entry);
    }
  }
  return kept;
}

/** Old link → its QRdx link, for items that have one. */
export function redirectTargets(job: ImportJob): JobItem[] {
  return job.items.filter(
    (item) => item.newLink && item.codeId && item.shortLink,
  );
}

/** Items the next redirect request handles, and how many remain after it. */
export function redirectBatch(
  job: ImportJob,
  mode: RedirectMode,
  size: number = REDIRECT_CHUNK_SIZE,
): { items: JobItem[]; remaining: number } {
  const live = (item: JobItem) =>
    Boolean(item.redirect && !item.redirect.undoneAt);
  // Links that failed in this run wait for "Try again" (clearRedirectErrors).
  const todo = redirectTargets(job).filter(
    (item) =>
      !item.redirectError && (mode === "undo" ? live(item) : !live(item)),
  );
  if (mode === "dry-run") return { items: todo, remaining: 0 };
  return {
    items: todo.slice(0, size),
    remaining: Math.max(0, todo.length - size),
  };
}

export function redirectPlanItem(
  item: JobItem,
  mode: RedirectMode,
): RedirectPlanItem {
  return mode === "undo"
    ? {
        key: item.key,
        shortLink: item.shortLink,
        from: item.newLink ?? "",
        to: item.redirect?.previousUrl ?? item.url,
      }
    : {
        key: item.key,
        shortLink: item.shortLink,
        from: item.url,
        to: item.newLink ?? "",
      };
}

/** Applies redirect outcomes (apply or undo) by item key. */
export function applyRedirects(
  job: ImportJob,
  mode: Exclude<RedirectMode, "dry-run">,
  outcomes: Map<string, { ok: boolean; previousUrl?: string; error?: string }>,
  now: Date,
): ImportJob {
  const at = now.toISOString();
  const items = job.items.map((item): JobItem => {
    const outcome = outcomes.get(item.key);
    if (!outcome) return item;
    if (!outcome.ok) return { ...item, redirectError: outcome.error };
    const { redirectError: _drop, ...rest } = item;
    if (mode === "undo") {
      return item.redirect
        ? { ...rest, redirect: { ...item.redirect, undoneAt: at } }
        : rest;
    }
    return {
      ...rest,
      redirect: {
        previousUrl: outcome.previousUrl ?? item.url,
        updatedAt: at,
      },
    };
  });
  return { ...job, items, updatedAt: at };
}

/** Clears earlier redirect errors so "Try again" retries those links. */
export function clearRedirectErrors(job: ImportJob): ImportJob {
  return {
    ...job,
    items: job.items.map(({ redirectError: _drop, ...item }) => item),
  };
}
