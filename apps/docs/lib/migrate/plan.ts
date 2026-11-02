// The import plan: which selected links become codes, which are skipped and
// why, which back-halves can be kept (and the generated slug of those that
// can't), and how many fit the plan. Pure: the server passes in what it
// looked up, the dev mock passes in fixtures.

import {
  backHalfMessage,
  backHalfShapeProblem,
  fallbackCandidates,
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
  BackHalfTarget,
  CodeRef,
  ImportOptions,
  ImportPreview,
  JobItem,
  PlannedItem,
  SourceLink,
} from "./types";

export type DestinationCheck =
  | { ok: true; url: string }
  | { ok: false; message: string };

/** QRdx side of options.backHalfDomain (the workspace's custom domain of that name). */
export interface BackHalfDomainState {
  qrdx: "verified" | "pending" | "missing";
  /** The plan includes custom domains */
  canUse: boolean;
}

export interface PlanContext {
  provider: ProviderId;
  options: ImportOptions;
  /** Codes already imported from this provider, by source link id */
  imported: ReadonlyMap<string, CodeRef>;
  /** Codes of the workspace by destinationKey() */
  byDestination: ReadonlyMap<string, CodeRef>;
  /** Slugs taken on qrdx.dev/q/ (among slugLookups().shared) */
  takenSlugs: ReadonlySet<string>;
  /** Slugs taken on the backHalfDomain (among slugLookups().domain) */
  takenOnDomain?: ReadonlySet<string>;
  /** Link id → generated slugs for when its back-half can't be kept */
  candidates: ReadonlyMap<string, string[]>;
  /** Free active-code slots; null = unlimited */
  remaining: number | null;
  /** Tag names that already exist in the workspace (lower case) */
  existingTags: ReadonlySet<string>;
  /** The plan lets imports keep back-halves (custom back-halves, Pro) */
  canKeepBackHalves: boolean;
  backHalfDomain: BackHalfDomainState | null;
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
  slugTarget: BackHalfTarget | null;
}

export interface ImportPlan {
  preview: ImportPreview;
  /** Same order as the input; `prepared` is set for every valid link */
  rows: {
    link: SourceLink;
    item: PlannedItem;
    prepared: PreparedLink | null;
  }[];
}

/**
 * Where a link's back-half would be kept: on the custom domain for links on
 * options.backHalfDomain once that domain is in QRdx (pending is enough: the
 * codes go live when it's verified), else on qrdx.dev/q/; null = not kept.
 */
export function backHalfTarget(
  link: SourceLink,
  options: ImportOptions,
  domain: BackHalfDomainState | null,
): BackHalfTarget | null {
  if (!link.backHalf) return null;
  if (options.backHalfDomain && link.domain === options.backHalfDomain) {
    return domain && domain.qrdx !== "missing" && domain.canUse
      ? "domain"
      : "shared";
  }
  return options.keepBackHalves ? "shared" : null;
}

/** Seed of a link's generated fallback slugs. */
const fallbackSeed = (link: SourceLink) => `${link.id}|${link.shortLink ?? ""}`;

/**
 * Slugs the server must look up before planning: the back-halves to keep (by
 * namespace) and each link's generated fallbacks (shared namespace).
 */
export function slugLookups(
  links: SourceLink[],
  options: ImportOptions,
  domain: BackHalfDomainState | null,
  random: () => string,
): {
  shared: string[];
  domain: string[];
  candidates: Map<string, string[]>;
} {
  const shared = new Set<string>();
  const onDomain = new Set<string>();
  const candidates = new Map<string, string[]>();
  for (const link of links) {
    const target = backHalfTarget(link, options, domain);
    if (!(target && link.backHalf)) continue;
    if (!backHalfShapeProblem(link.backHalf, target)) {
      (target === "domain" ? onDomain : shared).add(link.backHalf);
    }
    if (!candidates.has(link.id)) {
      const list = fallbackCandidates(fallbackSeed(link), random);
      candidates.set(link.id, list);
      for (const slug of list) shared.add(slug);
    }
  }
  return { shared: [...shared], domain: [...onDomain], candidates };
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
  // Per namespace: slugs given out in this selection, and kept back-halves.
  const used: Record<BackHalfTarget, Set<string>> = {
    shared: new Set(),
    domain: new Set(),
  };
  const keptBackHalves: Record<BackHalfTarget, Set<string>> = {
    shared: new Set(),
    domain: new Set(),
  };

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

  const wantsBackHalves = Boolean(
    options.backHalfDomain || options.keepBackHalves,
  );
  const backHalfAllowed = wantsBackHalves && ctx.canKeepBackHalves;

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
    const target = backHalfAllowed
      ? backHalfTarget(link, options, ctx.backHalfDomain)
      : null;
    if (target) {
      backHalf = planBackHalf(link, target, {
        taken:
          target === "domain"
            ? (ctx.takenOnDomain ?? new Set())
            : ctx.takenSlugs,
        takenShared: ctx.takenSlugs,
        used,
        kept: keptBackHalves,
        candidates: ctx.candidates,
      });
      if (backHalf.status === "kept") {
        kept += 1;
        used[target].add(backHalf.slug as string);
      } else {
        conflicts += 1;
        item.reason = backHalfMessage(
          backHalf.status as Exclude<
            BackHalfPlan["status"],
            "kept" | "not-on-domain"
          >,
          target,
          // Names the domain only for links on it.
          link.domain === options.backHalfDomain
            ? options.backHalfDomain
            : null,
        );
      }
    }
    item.backHalf = backHalf;

    // A back-half that can't be kept gets the generated slug the preview
    // shows (a shared-namespace slug, like every generated one).
    let slug: string | null = null;
    let slugTarget: BackHalfTarget | null = null;
    if (backHalf?.status === "kept") {
      slug = backHalf.slug;
      slugTarget = backHalf.target;
    } else if (backHalf) {
      slug = options.useSuggestions ? backHalf.suggestion : null;
      backHalf.slug = slug;
      if (slug) {
        slugTarget = "shared";
        used.shared.add(slug);
      }
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
        slugTarget,
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
      canKeepBackHalves: ctx.canKeepBackHalves,
      backHalves: wantsBackHalves
        ? {
            domain: options.backHalfDomain,
            qrdx: options.backHalfDomain
              ? (ctx.backHalfDomain?.qrdx ?? "missing")
              : null,
            canUse:
              ctx.canKeepBackHalves &&
              (!options.backHalfDomain || ctx.backHalfDomain?.canUse !== false),
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
  link: SourceLink,
  target: BackHalfTarget,
  state: {
    /** Taken in the target namespace */
    taken: ReadonlySet<string>;
    /** Taken on qrdx.dev/q/ (where generated fallbacks live) */
    takenShared: ReadonlySet<string>;
    used: Record<BackHalfTarget, Set<string>>;
    kept: Record<BackHalfTarget, Set<string>>;
    candidates: ReadonlyMap<string, string[]>;
  },
): BackHalfPlan {
  const backHalf = link.backHalf as string;
  const conflict = (
    status: Exclude<BackHalfPlan["status"], "kept" | "not-on-domain">,
  ): BackHalfPlan => ({
    status,
    target,
    slug: null,
    suggestion: pickSuggestion(
      state.candidates.get(link.id) ?? [],
      state.takenShared,
      state.used.shared,
    ),
  });

  const shape = backHalfShapeProblem(backHalf, target);
  if (shape) return conflict(shape);
  if (state.kept[target].has(backHalf)) return conflict("repeated");
  if (state.taken.has(backHalf) || state.used[target].has(backHalf)) {
    return conflict("taken");
  }
  state.kept[target].add(backHalf);
  return { status: "kept", target, slug: backHalf, suggestion: null };
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
      ...(prepared?.slugTarget && { slugTarget: prepared.slugTarget }),
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
