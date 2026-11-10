"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ScanScoreResult } from "qrdx";
import type { ReactNode } from "react";
import { CodeQr } from "@/app/(app)/dashboard/codes/_components/code-qr";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import { ScanScoreBadge } from "@/components/editor/scan-score";
import type { QRStyle } from "@/types/theme";

/**
 * The live QR with its scan score. Before the code exists it encodes a
 * placeholder link (see PREVIEW_SLUG), so it is labelled as a preview.
 */
export function BuilderPreview({
  style,
  value,
  link,
  isPreview,
  onScore,
  compact,
  action,
}: {
  style: QRStyle;
  /** What the QR encodes */
  value: string;
  /** The short link shown under it; null hides the line */
  link: string | null;
  /** The code doesn't exist yet: what it encodes isn't live */
  isPreview: boolean;
  onScore?: (result: ScanScoreResult) => void;
  /** The phone layout: a thumbnail beside the score */
  compact?: boolean;
  /** Phones: a button under the score (e.g. "Design") */
  action?: ReactNode;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <CodeQr
          className="bg-muted/40 size-24 shrink-0 rounded-lg border p-1.5"
          style={style}
          value={value}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <ScanScoreBadge onResult={onScore} style={style} value={value} />
          {link && (
            <p className="text-muted-foreground truncate text-xs">
              {displayUrl(link)}
            </p>
          )}
          {action}
        </div>
      </div>
    );
  }
  return (
    <div className="bg-muted/30 space-y-3 rounded-xl border p-4">
      <CodeQr
        className={cn("mx-auto w-full max-w-56 rounded-md")}
        style={style}
        value={value}
      />
      <div className="flex justify-center">
        <ScanScoreBadge onResult={onScore} style={style} value={value} />
      </div>
      {link && (
        <p className="text-muted-foreground truncate text-center text-xs">
          {displayUrl(link)}
        </p>
      )}
      {isPreview && (
        <p className="text-muted-foreground text-center text-xs">
          Preview. The link works once you create the code.
        </p>
      )}
    </div>
  );
}
