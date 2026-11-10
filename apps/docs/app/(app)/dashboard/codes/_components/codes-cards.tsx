"use client";

// The codes list as cards: what it opens first (icon, title, short link, destination), then tags, date, scans and
// the code's menu.

import { Star } from "@repo/design-system/components/icons";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight, Chart, Element2 } from "iconsax-reactjs";
import Link from "next/link";
import { useState } from "react";
import { setQrCodesFavorite } from "@/actions/bulk-codes";
import {
  LIST_ROW_FOCUS,
  type ListSelectionApi,
} from "@/app/dashboard/_components/list-selection";
import type { CodeProperty } from "@/app/dashboard/codes/_lib/display";
import type { TagRow } from "@/app/dashboard/codes/_lib/organize";
import type { FolderRow } from "@/app/dashboard/codes/_lib/organize-shared";
import type { QrCodeListItem } from "@/app/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { useCan, useWorkspaceHref } from "@/components/workspace-provider";
import { CodeActionsMenu } from "./code-actions-menu";
import { displayUrl, formatDate, formatNumber } from "./format";
import { Sparkline } from "./sparkline";
import { StatusBadge } from "./status-badge";
import { TagChip } from "./tag-chip";
import { useOrganizeAction } from "./use-organize-action";

export function FavoriteButton({ code }: { code: QrCodeListItem }) {
  const { run, isPending } = useOrganizeAction();
  // Read-only roles see the star, not a toggle (lib/permissions.ts).
  const canWrite = useCan("content.write");
  const label = code.isFavorite ? "Remove from favorites" : "Add to favorites";
  if (!canWrite) {
    return code.isFavorite ? (
      <span className="p-0.5" title="Favorite">
        <Star className="size-4 text-amber-400" variant="Bold" />
        <span className="sr-only">Favorite</span>
      </span>
    ) : null;
  }
  return (
    <button
      aria-label={label}
      aria-pressed={code.isFavorite}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm p-0.5 outline-none focus-visible:ring-2 disabled:opacity-50"
      disabled={isPending}
      onClick={() =>
        run(() =>
          setQrCodesFavorite({ ids: [code.id], favorite: !code.isFavorite }),
        )
      }
      title={label}
      type="button"
    >
      <Star
        className={cn("size-4", code.isFavorite && "text-amber-400")}
        variant={code.isFavorite ? "Bold" : "Linear"}
      />
    </button>
  );
}

/** A host the browser can ask for its icon (not localhost or an address). */
function iconHost(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    if (!hostname.includes(".") || /^[\d.]+$/.test(hostname)) return null;
    return hostname;
  } catch {
    return null;
  }
}

/**
 * What the code opens, at a glance: a hosted page's mark, else the
 * destination site's own icon (asked of that site, with no referrer and no
 * third-party icon service), else the site's first letter.
 */
export function DestinationIcon({
  code,
  className,
}: {
  code: Pick<QrCodeListItem, "kind" | "destinationUrl">;
  className?: string;
}) {
  const host = code.kind === "page" ? null : iconHost(code.destinationUrl);
  const [failed, setFailed] = useState(false);
  const tile = cn(
    "bg-muted/50 text-muted-foreground grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border text-xs font-medium uppercase",
    className,
  );
  if (code.kind === "page") {
    return (
      <span className={tile} title="Hosted page">
        <Element2 aria-hidden className="size-4" />
      </span>
    );
  }
  if (!host || failed) {
    return (
      <span aria-hidden className={tile}>
        {(host ?? displayUrl(code.destinationUrl)).replace(/^www\./, "")[0]}
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(tile, "bg-white dark:bg-white")}>
      <img
        alt=""
        className="size-4"
        decoding="async"
        height={16}
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={`https://${host}/favicon.ico`}
        width={16}
      />
    </span>
  );
}

/** "12 scans" with the last 7 days' trend, labelled; links to analytics. */
export function ScansPill({
  code,
  values,
  href,
}: {
  code: Pick<QrCodeListItem, "scanCount">;
  /** Daily scans, last 7 days */
  values: number[];
  href: string;
}) {
  const recent = values.reduce((sum, value) => sum + value, 0);
  const label = `${formatNumber(code.scanCount)} ${code.scanCount === 1 ? "scan" : "scans"}`;
  return (
    <Link
      aria-label={`${label}, ${formatNumber(recent)} in the last 7 days. Open analytics`}
      className="hover:bg-muted focus-visible:ring-ring/50 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-[3px]"
      href={href}
      title="Scans, with the last 7 days"
    >
      <Chart aria-hidden className="text-muted-foreground size-3.5" />
      <span className="max-sm:hidden">{label}</span>
      <span aria-hidden className="sm:hidden">
        {formatNumber(code.scanCount)}
      </span>
      {recent > 0 && (
        <span className="text-muted-foreground inline-flex items-center gap-1 border-l pl-1.5">
          <Sparkline height={14} values={values} width={32} />
          7d
        </span>
      )}
    </Link>
  );
}

export function CodesCards({
  codes,
  sparklines,
  selection,
  folders,
  tags,
  properties,
  keyboardShortcuts = false,
}: {
  codes: QrCodeListItem[];
  sparklines: Record<string, number[]>;
  /** Checkboxes, ranges and the list's keys (list-selection.tsx) */
  selection: ListSelectionApi;
  folders?: FolderRow[];
  tags?: TagRow[];
  properties: CodeProperty[];
  keyboardShortcuts?: boolean;
}) {
  const inWorkspace = useWorkspaceHref();
  const shows = (property: CodeProperty) => properties.includes(property);

  return (
    <ul aria-label="Codes" className="space-y-2">
      {codes.map((code) => {
        const href = inWorkspace(`/codes/${encodeURIComponent(code.id)}`);
        const inTrash = Boolean(code.deletedAt);
        const isSelected = selection.isSelected(code.id);
        const title = code.title || displayUrl(code.destinationUrl);
        const quiet = code.status !== "active" || Boolean(code.pausedAt);
        return (
          <li
            className={cn(
              "bg-card relative flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:px-4",
              LIST_ROW_FOCUS,
              isSelected
                ? "border-foreground/30 bg-muted/40"
                : "hover:border-foreground/20",
            )}
            key={code.id}
            {...selection.rowProps(code.id)}
          >
            <Checkbox
              aria-label={`Select ${title}`}
              className="max-sm:hidden"
              {...selection.checkboxProps(code.id)}
            />
            <DestinationIcon code={code} />

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {inTrash ? (
                  <span className="truncate text-sm font-medium">{title}</span>
                ) : (
                  <Link
                    className="truncate text-sm font-medium hover:underline"
                    href={href}
                  >
                    {title}
                  </Link>
                )}
                {!inTrash && <FavoriteButton code={code} />}
                {quiet && (
                  <StatusBadge
                    paused={Boolean(code.pausedAt)}
                    status={code.status}
                  />
                )}
              </div>
              {(shows("shortLink") || shows("destination")) && (
                <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                  {shows("shortLink") && (
                    <span className="flex min-w-0 shrink items-center gap-0.5">
                      <span className="text-foreground/80 truncate font-mono">
                        {displayUrl(code.shortLink)}
                      </span>
                      <CopyButton
                        className="size-6"
                        successMessage={{ title: "Short link copied" }}
                        textToCopy={code.shortLink}
                      />
                    </span>
                  )}
                  {shows("destination") && (
                    <span className="flex min-w-0 flex-1 items-center gap-1 max-sm:hidden">
                      <ArrowRight
                        aria-label="opens"
                        className="size-3 shrink-0"
                      />
                      <span className="truncate">
                        {code.kind === "page"
                          ? "Hosted page"
                          : displayUrl(code.destinationUrl)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {shows("tags") && code.tags.length > 0 && (
              <div className="hidden max-w-56 shrink-0 flex-wrap justify-end gap-1 lg:flex">
                {code.tags.slice(0, 2).map((tag) => (
                  <TagChip color={tag.color} key={tag.id} name={tag.name} />
                ))}
                {code.tags.length > 2 && (
                  <span className="text-muted-foreground text-xs">
                    +{code.tags.length - 2}
                  </span>
                )}
              </div>
            )}
            {shows("created") && (
              <span
                className="text-muted-foreground hidden shrink-0 text-xs whitespace-nowrap md:inline"
                title={inTrash ? "Moved to trash" : "Created"}
              >
                {formatDate(inTrash ? code.deletedAt : code.createdAt)}
              </span>
            )}
            {shows("scans") && (
              <ScansPill
                code={code}
                href={`${href}?tab=analytics`}
                values={sparklines[code.id] ?? []}
              />
            )}
            <CodeActionsMenu
              code={code}
              folders={folders}
              bulkKeys={selection.count > 0}
              keysActive={selection.activeRow === code.id}
              keysEnabled={keyboardShortcuts}
              tags={tags}
            />
          </li>
        );
      })}
    </ul>
  );
}
