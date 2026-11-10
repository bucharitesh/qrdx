// Changing what a printed dynamic code opens: a website link (kind
// "redirect") or a hosted page (kind "page"). The short link, scans, folder,
// tags, design and link controls stay; settings only one type uses are kept
// and pick up again when the code switches back. Pure and client-safe: the
// change-type dialog, the switch editor and the server (./code-kind.ts)
// share these rules.

import type { LandingBlock, LandingPageContent } from "@/types/landing";
import {
  CODE_OPTION_IDS,
  type CodeKind,
  type CodeOptionId,
  type CodeOptionState,
  codeOptionStatus,
  codeOptionsFor,
} from "./code-options";

/**
 * components/landing/page-settings-block PAGE_SETTINGS_TYPE, without
 * loading that block and its editor here (block types never change).
 */
export const PAGE_SETTINGS_TYPE = "page-settings";

export const KIND_LABELS: Record<CodeKind, string> = {
  redirect: "Website link",
  page: "Hosted page",
};

/**
 * Options set up on a code that a code of `kind` doesn't use: routing, A/B
 * tests, UTM and conversions on a hosted page; tracking pixels on a website
 * link. They stay saved and work again after switching back. Password and
 * schedule apply to both types.
 */
export function inactiveOptions(
  kind: CodeKind,
  marketing: CodeOptionState | null,
): CodeOptionId[] {
  const status = codeOptionStatus(marketing, null);
  const offered = new Set<CodeOptionId>(codeOptionsFor(kind));
  return CODE_OPTION_IDS.filter((id) => status[id] && !offered.has(id));
}

// ─── Carrying a page's content into another page type ───────────────────────

export interface CarryOverPlan {
  /** A block of the new template (index) filled with an old block (index) */
  matches: { to: number; from: number }[];
  /** Old blocks (indexes) the new template has no place for */
  left: number[];
}

/**
 * Pairs the old page's blocks with the new template's by block type, in
 * order: the first header fills the first header, the second links block
 * the second, and so on. Page settings are left out (they always carry).
 */
export function planCarryOver(
  fromTypes: readonly string[],
  toTypes: readonly string[],
): CarryOverPlan {
  const used = new Set<number>();
  const matches: CarryOverPlan["matches"] = [];
  const left: number[] = [];
  fromTypes.forEach((type, from) => {
    if (type === PAGE_SETTINGS_TYPE) return;
    const to = toTypes.findIndex(
      (candidate, index) => candidate === type && !used.has(index),
    );
    if (to === -1) {
      left.push(from);
      return;
    }
    used.add(to);
    matches.push({ to, from });
  });
  return { matches, left };
}

/**
 * The new template's content with the old page's matching blocks (same
 * type, so the same props schema), page settings and logo carried over.
 * The template keeps its layout, colors and fonts; old blocks without a
 * match stay on the old page, which is kept.
 */
export function carryOverContent(
  from: LandingPageContent,
  to: LandingPageContent,
): LandingPageContent {
  const plan = planCarryOver(
    from.blocks.map((block) => block.type),
    to.blocks.map((block) => block.type),
  );
  const blocks: LandingBlock[] = to.blocks.map((block) => ({ ...block }));
  for (const { to: target, from: source } of plan.matches) {
    const old = from.blocks[source] as LandingBlock;
    const current = blocks[target] as LandingBlock;
    blocks[target] = {
      id: current.id,
      type: current.type,
      props: structuredClone(old.props),
      ...(old.hidden && { hidden: true }),
    };
  }
  const settings = from.blocks.find(
    (block) => block.type === PAGE_SETTINGS_TYPE,
  );
  const withSettings = settings
    ? [
        ...blocks.filter((block) => block.type !== PAGE_SETTINGS_TYPE),
        structuredClone(settings),
      ]
    : blocks;
  return {
    ...to,
    theme: from.theme.logo
      ? { ...to.theme, logo: structuredClone(from.theme.logo) }
      : to.theme,
    blocks: withSettings,
  };
}

export interface CarryOverSummary {
  /** Labels of the old blocks that move to the new page */
  carried: string[];
  /** Labels of the old blocks that stay behind on the old page */
  left: string[];
}

/** What the confirmation lists, from block types and their labels. */
export function summarizeCarryOver(
  from: readonly { type: string; label: string }[],
  toTypes: readonly string[],
): CarryOverSummary {
  const plan = planCarryOver(
    from.map((block) => block.type),
    toTypes,
  );
  const label = (index: number) => from[index]?.label ?? "Block";
  return {
    carried: plan.matches
      .slice()
      .sort((a, b) => a.from - b.from)
      .map((match) => label(match.from)),
    left: plan.left.map(label),
  };
}

/** ["Header", "Links", "Links", "Map"] → "Header, Links (2) and Map". */
export function listLabels(labels: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const parts = [...counts].map(([label, count]) =>
    count > 1 ? `${label} (${count})` : label,
  );
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
