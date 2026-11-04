// What a limit card says, for every place that shows one: the app shell's
// compact notice, Plan & usage and the card shown when the server answers
// LIMIT_REACHED. Pure, so the copy is tested for every plan.

import { formatBytes } from "@/lib/files/types";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import {
  type CheckoutOpen,
  type Meter,
  type MeterCap,
  type MeterId,
  meterGate,
  meterLeft,
  meterLevel,
  meterValue,
  resetLine,
  type UpgradeAction,
  upgradeTo,
} from "./meters";

interface MeterWords {
  /** "active dynamic code" / "active dynamic codes" */
  one: string;
  many: string;
  /** What lifting the cap gives, short: "codes", "domains" */
  short: string;
  /** How to make room without upgrading; none for monthly counts */
  room?: string;
  /** Monthly counts start over */
  monthly?: boolean;
  /** Said when the cap is reached */
  keeps?: string;
}

const WORDS: Record<MeterId, MeterWords> = {
  dynamicCodes: {
    one: "active dynamic code",
    many: "active dynamic codes",
    short: "codes",
    room: "Archive one",
    keeps: "Existing codes keep working.",
  },
  landingPages: {
    one: "hosted page",
    many: "hosted pages",
    short: "pages",
    room: "Delete one",
    keeps: "Existing pages stay live.",
  },
  formResponses: {
    one: "form response",
    many: "form responses",
    short: "responses",
    monthly: true,
    keeps: "Pages stay live. Forms accept responses again after the reset.",
  },
  storage: {
    one: "of file storage",
    many: "of file storage",
    short: "storage",
    room: "Delete files you no longer need",
    keeps: "Files you've uploaded stay available.",
  },
  teamSeats: {
    one: "seat",
    many: "seats",
    short: "seats",
    room: "Revoke a pending invitation",
  },
  customDomains: {
    one: "custom domain",
    many: "custom domains",
    short: "domains",
    room: "Remove one",
    keeps: "Connected domains keep working.",
  },
  savedThemes: {
    one: "saved theme",
    many: "saved themes",
    short: "themes",
    room: "Delete one",
  },
  oauthApps: {
    one: "OAuth app",
    many: "OAuth apps",
    short: "apps",
    room: "Delete one",
  },
  aiArt: {
    one: "AI art image",
    many: "AI art images",
    short: "images",
    monthly: true,
  },
  aiThemes: {
    one: "AI theme request",
    many: "AI theme requests",
    short: "requests",
  },
};

/** Meters whose allowance is the person's own, whatever workspace is open. */
const PERSONAL: ReadonlySet<MeterId> = new Set(["aiThemes"]);

export interface LimitContext {
  /** The workspace's plan */
  plan: Plan;
  /** May change the workspace's plan (its owners) */
  canUpgrade: boolean;
  /** Paid plans checkout can sell right now */
  checkoutOpen: CheckoutOpen;
  /** The meter's cap here and the plan that lifts it */
  cap: MeterCap | undefined;
}

export interface LimitCopy {
  level: "near" | "full";
  /** "9 of 10" */
  value: string;
  /** "Almost full", "Limit reached" */
  status: string;
  /** One or two short sentences naming the plan */
  reason: string;
  upgrade: UpgradeAction | null;
  /** The server refuses new ones now, so the UI blocks too */
  blocked: boolean;
}

const count = (value: number) => value.toLocaleString("en-US");

/** "10 active dynamic codes", "50 MB of file storage" */
function amountOf(id: MeterId, value: number): string {
  const words = WORDS[id];
  if (id === "storage") return `${formatBytes(value)} ${words.many}`;
  return `${count(value)} ${value === 1 ? words.one : words.many}`;
}

/** "unlimited codes", "25 domains", "5 GB", "1,000 responses a month" */
function liftText(
  id: MeterId,
  { limit, shared }: { limit: number | null; shared?: true },
): string {
  const words = WORDS[id];
  const perMonth = words.monthly ? " a month" : "";
  const sharedBy = shared ? ", shared by the workspace" : "";
  if (id === "storage") {
    return limit === null ? "unlimited storage" : formatBytes(limit);
  }
  return limit === null
    ? `unlimited ${words.short}${sharedBy}`
    : `${count(limit)} ${words.short}${perMonth}${sharedBy}`;
}

const sentence = (text: string) => `${text[0]?.toUpperCase()}${text.slice(1)}`;

/** "Archive one or upgrade to Pro for unlimited codes." and its variants. */
function remedy(
  meter: Meter,
  ctx: LimitContext,
  upgrade: UpgradeAction | null,
): string {
  const words = WORDS[meter.id];
  const lift = ctx.cap?.lift ?? null;
  const room = words.room;
  if (lift && upgrade) {
    const to = `upgrade to ${PLAN_NAMES[lift.plan]} for ${liftText(meter.id, lift)}.`;
    return room ? `${room} or ${to}` : sentence(to);
  }
  const canUpgrade = ctx.canUpgrade || PERSONAL.has(meter.id);
  if (lift && !canUpgrade) {
    const ask = `ask a workspace owner to upgrade to ${PLAN_NAMES[lift.plan]}.`;
    return room ? `${room}, or ${ask}` : sentence(ask);
  }
  return room ? `${room} to make room.` : "";
}

/**
 * The card for a meter at 90% or more, or null below that, without a cap
 * (unlimited, never a card) or when the plan doesn't include it.
 */
export function limitCopy(meter: Meter, ctx: LimitContext): LimitCopy | null {
  const level = meterLevel(meter);
  if (level !== "near" && level !== "full") return null;
  const limit = meter.limit as number;
  const words = WORDS[meter.id];
  const plan = PLAN_NAMES[ctx.plan];
  const canUpgrade = ctx.canUpgrade || PERSONAL.has(meter.id);
  const upgrade = upgradeTo(
    ctx.cap?.lift?.plan ?? null,
    canUpgrade,
    ctx.checkoutOpen,
  );
  const resets = words.monthly ? resetLine(meter.resetsAt) : null;
  const sentences: string[] = [];

  if (level === "near") {
    const left =
      meter.unit === "bytes"
        ? meterLeft(meter)
        : amountOf(meter.id, Math.max(0, limit - meter.used));
    sentences.push(
      `${left} left${words.monthly ? " this month" : ""} on ${plan}.`,
    );
    if (resets) sentences.push(`${resets}.`);
  } else {
    sentences.push(
      `${plan} includes ${amountOf(meter.id, limit)}${words.monthly ? " a month" : ""}.`,
    );
    const fix = remedy(meter, ctx, upgrade);
    if (fix) sentences.push(fix);
    if (resets) sentences.push(`${resets}.`);
    if (words.keeps) sentences.push(words.keeps);
  }

  return {
    level,
    value: meterValue(meter, ctx.plan),
    status: level === "full" ? "Limit reached" : "Almost full",
    reason: sentences.join(" "),
    upgrade,
    blocked: meterGate(meter) === "block",
  };
}
