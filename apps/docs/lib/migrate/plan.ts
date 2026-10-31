// The import plan: which selected links become codes, which are skipped and
// why, which back-halves can be kept, and how many fit the plan. Pure: the
// server passes in what it looked up, the dev mock passes in fixtures.

import {
  BACK_HALF_MESSAGES,
  backHalfCandidates,
  backHalfShapeProblem,
  pickSuggestion,
} from "./back-halves";
import {
  cleanTags,
  cleanTitle,
  destinationKey,
  displayLink,
} from "./normalize";
import { getProvider, type ProviderId } from "./providers";
import type {
  BackHalfPlan,
  CodeRef,
  ImportOptions,
  ImportPreview,
  JobItem,
  PlannedItem,
  SourceLink,
} from "./types";

type ConflictStatus = keyof typeof BACK_HALF_MESSAGES;

export type DestinationCheck =
  | { ok: true; url: string }
  | { ok: false; message: string };

export interface PlanContext {
  provider: ProviderId;
  options: ImportOptions;
  /** Codes already imported from this provider, by source link id */
  imported: ReadonlyMap<string, CodeRef>;
  /** Codes of the workspace by destinationKey() */
  byDestination: ReadonlyMap<string, CodeRef>;
  /** Slugs used anywhere in QRdx (among the ones asked about) */
  takenSlugs: ReadonlySet<string>;
  /** Back-half → alternatives, from slugCandidates() */
  candidates: ReadonlyMap<string, string[]>;
  /** Free active-code slots; null = unlimited */
  remaining: number | null;
  /** Tag names that already exist in the workspace (lower case) */
  existingTags: ReadonlySet<string>;
  /** QRdx side of options.backHalfDomain */
  backHalfDomain: {
    qrdx: "verified" | "pending" | "missing";
    canUse: boolean;
  } | null;
  /** Server rules for destinations (the create API's schema) */
  checkDestination: (url: string) => DestinationCheck;
  /** Hosts of QRdx short links (default and the workspace's domains) */
  qrdxHosts: ReadonlySet<string>;
}

/** Normalized data of a link that will become a code. */
export interface PreparedLink {
  link: SourceLink;
  url: string;
  title: string | null;
  tags: string[];
  slug: string | null;
}

export interface ImportPlan {
  preview: ImportPreview;
  /** Same order as the input; `prepared` is set for every valid link */
  rows: { link: SourceLink; item: PlannedItem; prepared: PreparedLink | null }[];
}

/** Links whose back-half the import would try to keep. */
function backHalfLinks(links: SourceLink[], options: ImportOptions) {
  const domain = options.backHalfDomain;
  return domain ? links.filter((link) => link.domain === domain) : [];
}

/**
 * Slugs the server must look up before planning: the back-halves to keep and,
 * for those that can't be kept as they are, alternatives.
 */
export function slugCandidates(
  links: SourceLink[],
  options: ImportOptions,
): { slugs: string[]; candidates: Map<string, string[]> } {
  const slugs = new Set<string>();
  const candidates = new Map<string, string[]>();
  for (const link of backHalfLinks(links, options)) {
    if (!link.backHalf) continue;
    if (!backHalfShapeProblem(link.backHalf)) slugs.add(link.backHalf);
    if (!candidates.has(link.backHalf)) {
      const list = backHalfCandidates(link.backHalf);
      candidates.set(link.backHalf, list);
      for (const slug of list) slugs.add(slug);
    }
  }
  return { slugs: [...slugs], candidates };
}

const REASONS = {
  imported: "Already imported",
  duplicate: "A QRdx code with this destination already exists",
  selectedTwice: "Selected twice",
  qrdx: "Already points to a QRdx short link",
  limit: "Over your plan's active-code limit",
};

function pointsToQrdx(url: string, hosts: ReadonlySet<string>): boolean {
  try {
    return hosts.has(new URL(url).host.toLowerCase());
  } catch {
    return false;
  }
}

export function planImport(links: SourceLink[], ctx: PlanContext): ImportPlan {
  const { options } = ctx;
  const provider = getProvider(ctx.provider);
  const seenIds = new Set<string>();
  const usedSlugs = new Set<string>();
  const keptBackHalves = new Set<string>();

  const cap = Math.min(
    ctx.remaining ?? Number.POSITIVE_INFINITY,
    options.limit ?? Number.POSITIVE_INFINITY,
  );
  let creates = 0;
  let wanted = 0;
  const newTags = new Map<string, string>();
  const existingTags = new Map<string, string>();
  const branded = new Set<string>();
  let kept = 0;
  let conflicts = 0;

  const backHalfAllowed = Boolean(
    options.backHalfDomain && ctx.backHalfDomain?.canUse,
  );

  const rows = links.map((link) => {
    if (
      link.domain &&
      !(provider.kind === "api" && provider.sharedDomains.includes(link.domain))
    ) {
      branded.add(link.domain);
    }
    const item: PlannedItem = {
      id: link.id,
      status: "create",
      reason: null,
      existing: null,
      backHalf: null,
    };
    const skip = (
      status: PlannedItem["status"],
      reason: string,
      existing: CodeRef | null = null,
    ) => {
      item.status = status;
      item.reason = reason;
      item.existing = existing;
      return { link, item, prepared: null };
    };

    if (seenIds.has(link.id)) return skip("invalid", REASONS.selectedTwice);
    seenIds.add(link.id);

    const destination = ctx.checkDestination(link.destinationUrl);
    if (!destination.ok) return skip("invalid", destination.message);
    if (pointsToQrdx(destination.url, ctx.qrdxHosts)) {
      return skip("invalid", REASONS.qrdx);
    }

    const imported = ctx.imported.get(link.id);
    if (imported) return skip("already-imported", REASONS.imported, imported);

    const sameDestination = ctx.byDestination.get(
      destinationKey(destination.url) ?? destination.url,
    );
    if (sameDestination && !options.includeDuplicates) {
      return skip("duplicate", REASONS.duplicate, sameDestination);
    }

    wanted += 1;
    if (creates >= cap) return skip("over-limit", REASONS.limit);
    creates += 1;

    const tags = options.carryTags ? cleanTags(link.tags) : [];
    for (const name of tags) {
      const key = name.toLowerCase();
      const bucket = ctx.existingTags.has(key) ? existingTags : newTags;
      if (!bucket.has(key)) bucket.set(key, name);
    }

    let backHalf: BackHalfPlan | null = null;
    if (backHalfAllowed && link.domain === options.backHalfDomain) {
      backHalf = planBackHalf(link.backHalf, {
        taken: ctx.takenSlugs,
        used: usedSlugs,
        kept: keptBackHalves,
        candidates: ctx.candidates,
      });
      if (backHalf.slug) usedSlugs.add(backHalf.slug);
      if (backHalf.status === "kept") {
        kept += 1;
      } else {
        conflicts += 1;
        item.reason = BACK_HALF_MESSAGES[backHalf.status as ConflictStatus];
      }
    }
    item.backHalf = backHalf;

    const slug =
      backHalf?.status === "kept"
        ? backHalf.slug
        : options.useSuggestions
          ? (backHalf?.suggestion ?? null)
          : null;
    if (backHalf && backHalf.status !== "kept") {
      backHalf.slug = slug;
      if (slug) usedSlugs.add(slug);
    }

    return {
      link,
      item,
      prepared: {
        link,
        url: destination.url,
        title:
          cleanTitle(link.title) ??
          (link.shortLink ? displayLink(link.shortLink) : null),
        tags,
        slug,
      },
    };
  });

  const count = (status: PlannedItem["status"]) =>
    rows.filter((row) => row.item.status === status).length;

  return {
    rows,
    preview: {
      provider: ctx.provider,
      total: links.length,
      creates,
      alreadyImported: count("already-imported"),
      duplicates: count("duplicate"),
      invalid: count("invalid"),
      overLimit: count("over-limit"),
      folderName: options.folderName?.trim() || null,
      newTags: [...newTags.values()],
      existingTags: [...existingTags.values()],
      remaining: ctx.remaining,
      wanted,
      backHalves:
        options.backHalfDomain && ctx.backHalfDomain
          ? {
              domain: options.backHalfDomain,
              qrdx: ctx.backHalfDomain.qrdx,
              canUse: ctx.backHalfDomain.canUse,
              kept,
              conflicts,
            }
          : null,
      brandedDomains: [...branded].sort(),
      items: rows.map((row) => row.item),
    },
  };
}

function planBackHalf(
  backHalf: string | null,
  state: {
    taken: ReadonlySet<string>;
    used: Set<string>;
    kept: Set<string>;
    candidates: ReadonlyMap<string, string[]>;
  },
): BackHalfPlan {
  if (!backHalf) return { status: "shape", slug: null, suggestion: null };
  const suggest = () =>
    pickSuggestion(
      state.candidates.get(backHalf) ?? [],
      state.taken,
      state.used,
    );

  const shape = backHalfShapeProblem(backHalf);
  if (shape) return { status: shape, slug: null, suggestion: suggest() };
  if (state.kept.has(backHalf)) {
    return { status: "repeated", slug: null, suggestion: suggest() };
  }
  if (state.taken.has(backHalf) || state.used.has(backHalf)) {
    return { status: "taken", slug: null, suggestion: suggest() };
  }
  state.kept.add(backHalf);
  return { status: "kept", slug: backHalf, suggestion: null };
}

/** Job items from a plan: pending for creates, skipped (with reasons) for the rest. */
export function jobItemsFromPlan(plan: ImportPlan): JobItem[] {
  return plan.rows.map(({ link, item, prepared }) => {
    const base: JobItem = {
      key: link.id,
      shortLink: link.shortLink,
      url: prepared?.url ?? link.destinationUrl,
      title: prepared?.title ?? cleanTitle(link.title),
      tags: prepared?.tags ?? [],
      createdAt: link.createdAt,
      slug: prepared?.slug ?? null,
      status: item.status === "create" ? "pending" : "skipped",
    };
    if (item.status !== "create") {
      base.reason = item.reason ?? undefined;
      if (item.existing) {
        // Old links of skipped items can still point at the existing code.
        base.codeId = item.existing.id;
        base.newLink = item.existing.shortLink;
      }
    }
    return base;
  });
}
