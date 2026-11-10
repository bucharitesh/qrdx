// Catalog bookkeeping for scripts/i18n-check.ts, scripts/i18n-translate.ts
// and their tests. Node only (node:crypto); never imported by pages.
//
// messages/review/<locale>.json records, per key, the hash of the English it
// was translated from and its review status. A translation is "stale" when
// the English has changed since; i18n:translate redoes those.
import { createHash } from "node:crypto";
import { shapeMismatch } from "./icu";
import type { ReviewState } from "./review";

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
 * Checks one translation against English: every key present and no extras,
 * the same ICU arguments and tags, every number kept, a review entry per key.
 * A locale marked "reviewed" (lib/i18n/review.ts) must have no machine or
 * stale strings left.
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

  for (const [key, message] of source) {
    const translation = translated.get(key);
    if (translation === undefined || translation.trim() === "") {
      report.counts.missing++;
      report.errors.push(`${locale}: ${key} is missing`);
      continue;
    }
    const mismatch = shapeMismatch(message, translation);
    if (mismatch) report.errors.push(`${locale}: ${key}: ${mismatch}`);
    const entry = review[key];
    if (!entry) {
      report.errors.push(`${locale}: ${key} has no review entry`);
      continue;
    }
    const stale = entry.source !== sourceHash(message);
    if (stale) {
      report.counts.stale++;
      (strict ? report.errors : report.warnings).push(
        `${locale}: ${key} is stale (the English changed since it was translated)`,
      );
    } else if (entry.status === "reviewed") {
      report.counts.reviewed++;
    } else {
      report.counts.machine++;
      if (strict) {
        report.errors.push(
          `${locale}: ${key} is a machine translation, but ${locale} is marked reviewed`,
        );
      }
    }
  }
  for (const key of translated.keys()) {
    if (!source.has(key))
      report.errors.push(`${locale}: ${key} isn't in English`);
  }
  for (const key of Object.keys(review)) {
    if (!source.has(key)) {
      report.warnings.push(`${locale}: review entry ${key} isn't in English`);
    }
  }
  return report;
}
