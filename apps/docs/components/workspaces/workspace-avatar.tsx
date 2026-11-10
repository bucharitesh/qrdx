"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useState } from "react";
import { logoImageSrc } from "@/lib/workspace-logo";

const SIZES = {
  xs: "size-5 rounded text-[11px]",
  sm: "size-7 rounded-md text-xs",
  md: "size-10 rounded-lg text-sm",
  lg: "size-16 rounded-xl text-xl",
} as const;

/**
 * A workspace's logo, or its initial letter when it has none (or the image
 * doesn't load). Logos are uploads served by QRdx or https URLs the owner
 * typed; the browser loads them without a referrer, the server never does.
 * Only https URLs, paths on this site and data:image/ URLs are rendered
 * (logoImageSrc), whatever got stored.
 */
export function WorkspaceAvatar({
  name,
  logo,
  size = "sm",
  tone = "solid",
  className,
}: {
  name: string;
  logo?: string | null;
  size?: keyof typeof SIZES;
  /** solid: the open workspace's tile; muted: lists */
  tone?: "solid" | "muted";
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = logoImageSrc(logo);
  const showLogo = src !== null && failed !== src;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden font-semibold uppercase select-none",
        SIZES[size],
        showLogo
          ? "bg-background ring-border ring-1"
          : tone === "solid"
            ? "bg-foreground text-background"
            : "bg-muted text-foreground",
        className,
      )}
    >
      {showLogo ? (
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          onError={() => setFailed(src)}
          referrerPolicy="no-referrer"
          src={src ?? undefined}
        />
      ) : (
        name.trim().charAt(0) || "W"
      )}
    </span>
  );
}
