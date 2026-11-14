// Catalog bookkeeping for scripts/i18n-check.ts, scripts/i18n-translate.ts
// and their tests. Node only (node:crypto): pages reach sourceHash() only on
// the server, through lib/i18n/content-server.ts.
//
// messages/review/<locale>.json records, per key, the hash of the English it
// was translated from and its review status. A translation is "stale" when
// the English has changed since; i18n:translate redoes those.
import { createHash } from "node:crypto";
import type { ReviewState } from "@repo/i18n/review";
import { numberMismatch, shapeMismatch } from "./icu";

export type Catalog = { [key: string]: string | Catalog };

export type ReviewStatus = "machine" | "reviewed";

export interface ReviewEntry {
  /** sourceHash() of the English it was translated from. */
  source: string;
  status: ReviewStatus;
}

export type ReviewFile = Record<string, ReviewEntry>;

/** "a.b.c" → message, in catalog order. */
export function flatten(catalog: Catalog, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const entry of flatten(value, path)) out.set(...entry);
  }
  return out;
}

/** Nested catalog from flat keys, in the English catalog's key order. */
export function unflatten(
  messages: Map<string, string>,
  order: Catalog,
): Catalog {
  const build = (shape: Catalog, prefix: string): Catalog => {
    const out: Catalog = {};
    for (const [key, value] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        const message = messages.get(path);
        if (message !== undefined) out[key] = message;
      } else {
        const child = build(value, path);
        if (Object.keys(child).length > 0) out[key] = child;
      }
    }
    return out;
  };
  return build(order, "");
}

export function sourceHash(english: string): string {
  return createHash("sha256").update(english).digest("hex").slice(0, 12);
}

export interface LocaleReport {
  errors: string[];
  warnings: string[];
  counts: {
    keys: number;
    missing: number;
    machine: number;
    reviewed: number;
    stale: number;
  };
}

/**
 * Checks one translation against English. Always errors: keys English
 * doesn't have, broken ICU arguments or tags, dropped numbers. A partial
 * catalog is fine while the locale isn't reviewed (missing strings render
 * in English): missing, unrecorded and stale strings are warnings. A locale
 * marked "reviewed" (packages/i18n/config.ts) must be complete, recorded and
 * signed off string by string.
 */
export function checkLocale({
  locale,
  english,
  catalog,
  review,
  state,
}: {
  locale: string;
  english: Catalog;
  catalog: Catalog;
  review: ReviewFile;
  state: ReviewState;
}): LocaleReport {
  const report: LocaleReport = {
    errors: [],
    warnings: [],
    counts: { keys: 0, missing: 0, machine: 0, reviewed: 0, stale: 0 },
  };
  const source = flatten(english);
  const translated = flatten(catalog);
  report.counts.keys = source.size;
  const strict = state === "reviewed";
  const soft = (message: string) =>
    (strict ? report.errors : report.warnings).push(message);

  for (const [key, message] of source) {
    const translation = translated.get(key);
    if (translation === undefined || translation.trim() === "") {
      report.counts.missing++;
      soft(`${locale}: ${key} is missing (shows in English)`);
      continue;
    }
    const mismatch = shapeMismatch(message, translation);
    if (mismatch) report.errors.push(`${locale}: ${key}: ${mismatch}`);
    const entry = review[key];
    if (!entry) {
      report.counts.machine++;
      soft(
        `${locale}: ${key} has no review entry (run i18n:translate --record)`,
      );
      continue;
    }
    if (entry.source !== sourceHash(message)) {
      report.counts.stale++;
      soft(
        `${locale}: ${key} is stale (the English changed since it was translated)`,
      );
    } else if (entry.status === "reviewed") {
      report.counts.reviewed++;
    } else {
      report.counts.machine++;
      if (strict) {
        report.errors.push(
          `${locale}: ${key} isn't reviewed, but ${locale} is marked reviewed`,
        );
      }
    }
  }
  for (const key of translated.keys()) {
    if (!source.has(key)) {
      report.errors.push(`${locale}: ${key} isn't in English`);
    }
  }
  for (const key of Object.keys(review)) {
    if (!source.has(key)) {
      report.warnings.push(`${locale}: review entry ${key} isn't in English`);
    }
  }
  return report;
}

export interface ContentReport {
  errors: string[];
  warnings: string[];
  counts: {
    strings: number;
    missing: number;
    machine: number;
    reviewed: number;
    unused: number;
  };
}

/**
 * Checks one locale's translation memory (lib/i18n/content.ts) against the
 * English the sources hold now. Errors: a translation that lost a number,
 * or an entry filed under the wrong hash. Missing strings show in English
 * and are warnings, unless the locale is marked "reviewed"; so are entries
 * no source uses any more (`i18n:translate --prune` drops them).
 */
export function checkContent({
  locale,
  english,
  memory,
  state,
}: {
  locale: string;
  english: readonly { english: string; context: string }[];
  memory: Record<
    string,
    { source: string; text: string; status: ReviewStatus; context?: string }
  >;
  state: ReviewState;
}): ContentReport {
  const report: ContentReport = {
    errors: [],
    warnings: [],
    counts: {
      strings: english.length,
      missing: 0,
      machine: 0,
      reviewed: 0,
      unused: 0,
    },
  };
  const strict = state === "reviewed";
  const soft = (message: string) =>
    (strict ? report.errors : report.warnings).push(message);
  const used = new Set<string>();
  for (const { english: source, context } of english) {
    const hash = sourceHash(source);
    used.add(hash);
    const entry = memory[hash];
    if (!entry?.text.trim()) {
      report.counts.missing++;
      soft(`${locale}: content ${context} is missing (shows in English)`);
      continue;
    }
    if (entry.status === "reviewed") report.counts.reviewed++;
    else {
      report.counts.machine++;
      if (strict) {
        report.errors.push(
          `${locale}: content ${context} isn't reviewed, but ${locale} is marked reviewed`,
        );
      }
    }
  }
  for (const [hash, entry] of Object.entries(memory)) {
    if (sourceHash(entry.source) !== hash) {
      report.errors.push(
        `${locale}: content entry ${hash} doesn't match its English ("${entry.source.slice(0, 40)}…")`,
      );
      continue;
    }
    const mismatch = numberMismatch(entry.source, entry.text);
    if (mismatch) {
      report.errors.push(
        `${locale}: content ${entry.context ?? hash}: ${mismatch}`,
      );
    }
    if (!used.has(hash)) {
      report.counts.unused++;
      report.warnings.push(
        `${locale}: content entry ${entry.context ?? hash} isn't used any more`,
      );
    }
  }
  return report;
}
