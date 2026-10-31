"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { Heart } from "iconsax-reactjs";
import { SpotlightCard } from "@/components/fx";
import { PRESSABLE } from "@/components/mockups/motion";
import { ThemePreview } from "@/components/theme-preview";
import { useToggleLike } from "@/lib/hooks/themes";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import type { CommunityTheme } from "@/types/community";

interface CommunityThemeCardProps {
  theme: CommunityTheme;
  onPreview: (theme: CommunityTheme) => void;
}

export function CommunityThemeCard({
  theme,
  onPreview,
}: CommunityThemeCardProps) {
  const toggleLike = useToggleLike();
  const { checkValidSession } = useSessionGuard();

  usePostLoginAction("LIKE_THEME", (data?: { communityThemeId: string }) => {
    if (data?.communityThemeId === theme.id) {
      toggleLike.mutate(theme.id);
    }
  });

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !checkValidSession("signin", "LIKE_THEME", {
        communityThemeId: theme.id,
      })
    ) {
      return;
    }

    toggleLike.mutate(theme.id);
  };

  const authorInitials = theme.author.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const publishedDate = new Date(theme.publishedAt).toLocaleDateString(
    "en-US",
    { day: "numeric", month: "short" },
  );

  return (
    <SpotlightCard
      aria-label={`Preview ${theme.name}`}
      as={Card}
      className={cn(
        "group h-full cursor-pointer gap-0 overflow-hidden py-0 shadow-xs outline-none hover:border-foreground/15 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        PRESSABLE,
      )}
      onClick={() => onPreview(theme)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(theme);
        }
      }}
      // The card holds the like <button>, which a <button> wrapper can't nest.
      role="button"
      tabIndex={0}
    >
      <div className="relative h-44 w-full overflow-hidden border-b">
        <ThemePreview
          className="transition-transform duration-300 group-hover:scale-[1.02]"
          name={theme.name}
          styles={theme.styles}
        />
        {theme.tags.length > 0 && (
          <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1">
            {theme.tags.slice(0, 2).map((tag) => (
              <Badge
                className="border-0 bg-background/85 px-1.5 py-0 text-[10px] text-foreground shadow-sm backdrop-blur-sm"
                key={tag}
              >
                {tag}
              </Badge>
            ))}
            {theme.tags.length > 2 && (
              <Badge className="border-0 bg-background/85 px-1.5 py-0 text-[10px] text-foreground shadow-sm backdrop-blur-sm">
                +{theme.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 py-2.5 pr-2.5 pl-4">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="size-5 shrink-0">
            <AvatarImage
              alt={theme.author.name}
              src={theme.author.image}
              referrerPolicy="no-referrer"
            />
            <AvatarFallback className="text-[9px]">
              {authorInitials}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-xs font-medium">
            {theme.author.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {publishedDate}
          </span>
        </div>
        <button
          aria-label={theme.isLikedByMe ? "Unlike theme" : "Like theme"}
          aria-pressed={theme.isLikedByMe}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
            theme.isLikedByMe
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={handleLike}
          type="button"
        >
          <Heart
            className="size-3.5"
            variant={theme.isLikedByMe ? "Bold" : "Linear"}
          />
          {theme.likeCount > 0 && <span>{theme.likeCount}</span>}
        </button>
      </div>
    </SpotlightCard>
  );
}
