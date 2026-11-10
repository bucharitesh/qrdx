"use client";

import { cn } from "@repo/design-system/lib/utils";
import { TableDocument } from "iconsax-reactjs";
import type { ReactNode } from "react";
import { getProvider, type ProviderId } from "@/lib/migrate/providers";

/**
 * Brand logo on a white tile (logos are drawn for light backgrounds). "Another
 * provider (CSV)" has no brand, so it gets a spreadsheet icon on the same tile.
 */
export function ProviderLogo({
  provider,
  size = "md",
}: {
  provider: ProviderId;
  size?: "sm" | "md";
}) {
  const { logo } = getProvider(provider);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 grid-cols-1 grid-rows-1 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-black/5 dark:ring-white/10",
        size === "sm" ? "size-7 p-1" : "size-9 p-1.5",
      )}
    >
      {logo ? (
        <img alt="" className="size-full object-contain" src={logo} />
      ) : (
        <TableDocument
          className={cn(
            "text-neutral-700",
            size === "sm" ? "size-4" : "size-5",
          )}
        />
      )}
    </span>
  );
}

/** Scrollable body plus a footer with the step's actions. */
export function StepLayout({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3.5">
          {footer}
        </div>
      )}
    </>
  );
}

export function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: number | string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

/** Small neutral note: icon, then text. */
export function Note({
  icon,
  tone = "neutral",
  children,
}: {
  icon: ReactNode;
  tone?: "neutral" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        tone === "warning"
          ? "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400"
          : "bg-muted/40 text-muted-foreground [&_svg]:text-foreground/70",
      )}
    >
      {icon}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function saveText(text: string, filename: string, type = "text/csv") {
  const url = URL.createObjectURL(
    new Blob([text], { type: `${type};charset=utf-8` }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const formatCount = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

export function formatDay(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
