"use client";

import { Progress } from "@repo/design-system/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { Warning2 } from "iconsax-reactjs";
import Link from "next/link";
import { use } from "react";
import {
  type Meter,
  meterLevel,
  meterPercent,
  meterValue,
} from "@/app/(app)/settings/usage/_lib/meters";
import type { Plan } from "@/lib/pricing";

/**
 * The sidebar's quiet warning: the fullest limit at 90% or more, and how
 * many others are, linking to Plan & usage. Nothing below 90%, and never
 * for an unlimited count. `collapsed` shows an icon with the same line in
 * a tooltip.
 */
export function LimitNoticeView({
  meters,
  plan,
  usageHref,
  collapsed = false,
  onNavigate,
}: {
  /** At 90% or more, fullest first (attentionMeters) */
  meters: Meter[];
  plan: Plan;
  usageHref: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const top = meters[0];
  if (!top) return null;
  const status = meterLevel(top) === "full" ? "Limit reached" : "Almost full";
  const others = meters.length - 1;
  const more =
    others > 0 ? ` · ${others} more ${others === 1 ? "limit" : "limits"}` : "";
  const line = `${top.label}: ${meterValue(top, plan)}`;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            aria-label={`${line}. ${status}${more}. Plan & usage`}
            className="text-primary hover:bg-foreground/[0.05] focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-[3px]"
            href={usageHref}
            onClick={onNavigate}
          >
            <Warning2 aria-hidden className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          {line} · {status}
          {more}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      className="bg-foreground/[0.035] hover:bg-foreground/[0.06] focus-visible:ring-ring/50 block rounded-lg px-3 py-2.5 outline-none transition-colors focus-visible:ring-[3px]"
      href={usageHref}
      onClick={onNavigate}
    >
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium">{top.label}</span>
        <span className="text-primary shrink-0 font-medium tabular-nums">
          {meterValue(top, plan)}
        </span>
      </span>
      <Progress
        aria-label={`${top.label} used`}
        className="mt-2 h-1"
        value={meterPercent(top)}
      />
      <span className="text-muted-foreground mt-1.5 block truncate text-[11px]">
        {status}
        {more}
      </span>
    </Link>
  );
}

/** LimitNoticeView once the shell's counts arrive (streamed, never blocking). */
export function LimitNotice({
  warnings,
  ...props
}: Omit<Parameters<typeof LimitNoticeView>[0], "meters"> & {
  warnings: Promise<Meter[]>;
}) {
  const meters = use(warnings);
  return <LimitNoticeView meters={meters} {...props} />;
}
