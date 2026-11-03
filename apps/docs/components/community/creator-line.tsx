"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { Verify } from "iconsax-reactjs";
import Link from "next/link";
import { QrdxLogo } from "@/components/qrdx-logo";
import { profilePath } from "@/lib/community/handles";
import type { CommunityCreator } from "@/lib/community/types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Avatar, name, @handle and the verified mark of a creator. */
export function CreatorLine({
  creator,
  size = "sm",
  link = true,
  className,
}: {
  creator: CommunityCreator;
  size?: "sm" | "md" | "lg";
  /** Link the handle to the profile (off inside another link) */
  link?: boolean;
  className?: string;
}) {
  const avatar =
    size === "lg" ? "size-12" : size === "md" ? "size-8" : "size-5";
  const handle = creator.handle ? `@${creator.handle}` : null;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        size === "lg"
          ? "gap-3 text-base"
          : size === "md"
            ? "text-sm"
            : "text-xs",
        className,
      )}
    >
      {creator.official ? (
        <span
          className={cn(
            "bg-foreground text-background grid shrink-0 place-items-center rounded-full",
            avatar,
          )}
        >
          <QrdxLogo className="size-[60%]" />
        </span>
      ) : (
        <Avatar className={cn("shrink-0", avatar)}>
          {creator.avatarUrl && (
            <AvatarImage
              alt=""
              referrerPolicy="no-referrer"
              src={creator.avatarUrl}
            />
          )}
          <AvatarFallback className="text-[9px]">
            {initials(creator.displayName)}
          </AvatarFallback>
        </Avatar>
      )}
      <span
        className={cn(
          "truncate font-medium",
          size === "lg" && "text-2xl font-semibold tracking-tight",
        )}
      >
        {creator.displayName}
      </span>
      {creator.verified && (
        <Verify
          aria-label="Verified"
          className="text-foreground size-3.5 shrink-0"
          variant="Bold"
        />
      )}
      {handle &&
        (link && creator.handle ? (
          <Link
            className="text-muted-foreground hover:text-foreground truncate"
            href={profilePath(creator.handle)}
          >
            {handle}
          </Link>
        ) : (
          <span className="text-muted-foreground truncate">{handle}</span>
        ))}
    </span>
  );
}
