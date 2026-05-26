"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { cn } from "@repo/design-system/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { lazy, useCallback, useEffect } from "react";
import ExamplesPreviewContainer from "@/components/editor/theme-preview/examples-preview-container";
import { siteConfig } from "@/config/site";
import { useToggleLike } from "@/lib/hooks/themes";
import { useSessionGuard } from "@/lib/hooks/use-gaurds";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import type { CommunityTheme } from "@/types/community";

const QRCode = lazy(() =>
  import("qrdx").then((module) => ({ default: module.QRCode })),
);

const PREVIEW_VALUE = "https://qrdx.app";

interface CommunityThemePreviewDialogProps {
  theme: CommunityTheme | null;
  themes: CommunityTheme[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (theme: CommunityTheme) => void;
}

export function CommunityThemePreviewDialog({
  theme,
  themes,
  open,
  onOpenChange,
  onNavigate,
}: CommunityThemePreviewDialogProps) {
  const router = useRouter();
  const toggleLike = useToggleLike();
  const { checkValidSession } = useSessionGuard();

  const displayTheme = theme
    ? (themes.find((t) => t.id === theme.id) ?? theme)
    : null;

  const currentIndex = displayTheme
    ? themes.findIndex((t) => t.id === displayTheme.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < themes.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) onNavigate(themes[currentIndex - 1]);
  }, [hasPrev, themes, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) onNavigate(themes[currentIndex + 1]);
  }, [hasNext, themes, currentIndex, onNavigate]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goToPrev, goToNext]);

  usePostLoginAction("LIKE_THEME", (data?: { communityThemeId: string }) => {
    if (displayTheme && data?.communityThemeId === displayTheme.id) {
      toggleLike.mutate(displayTheme.id);
    }
  });

  if (!displayTheme) return null;

  const handleLike = () => {
    if (
      !checkValidSession("signin", "LIKE_THEME", {
        communityThemeId: displayTheme.id,
      })
    ) {
      return;
    }
    toggleLike.mutate(displayTheme.id);
  };

  const handleViewDetails = () => {
    onOpenChange(false);
    router.push(`/playground/${displayTheme.themeId}`);
  };

  const handleShare = async () => {
    const url = `${siteConfig.url}/playground/${displayTheme.themeId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Theme URL copied to clipboard!");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  const authorInitials = displayTheme.author.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const styles = displayTheme.styles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[80vh] w-[95vw] max-w-6xl flex-col gap-0 overflow-visible p-0"
        style={
          {
            "--tw-enter-translate-x": "0",
            "--tw-enter-translate-y": "0",
            "--tw-exit-translate-x": "0",
            "--tw-exit-translate-y": "0",
          } as React.CSSProperties
        }
      >
        {hasPrev && (
          <button
            type="button"
            onClick={goToPrev}
            className="absolute -left-14 top-1/2 -translate-y-1/2 rounded-full border bg-background/80 p-2 text-foreground shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-background"
            aria-label="Previous theme"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={goToNext}
            className="absolute -right-14 top-1/2 -translate-y-1/2 rounded-full border bg-background/80 p-2 text-foreground shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-background"
            aria-label="Next theme"
          >
            <ChevronRight className="size-5" />
          </button>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base font-semibold">
                {displayTheme.name}
              </DialogTitle>
              <span className="text-muted-foreground/40">|</span>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Avatar className="h-5 w-5">
                  <AvatarImage
                    src={displayTheme.author.image}
                    alt={displayTheme.author.name}
                  />
                  <AvatarFallback className="text-[9px]">
                    {authorInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs">{displayTheme.author.name}</span>
              </div>
            </div>
          </DialogHeader>

          <div className="flex shrink-0 items-center justify-between px-4 py-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Preview
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  displayTheme.isLikedByMe
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                title={
                  displayTheme.isLikedByMe ? "Unlike theme" : "Like theme"
                }
              >
                <Heart
                  className={cn(
                    "size-4",
                    displayTheme.isLikedByMe && "fill-current",
                  )}
                />
                {displayTheme.likeCount > 0 && (
                  <span>{displayTheme.likeCount}</span>
                )}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Share theme"
              >
                <Share2 className="size-4" />
              </button>
              <div className="mr-2 h-4 w-px bg-border" />
              <Button
                variant="link"
                className="p-0 font-semibold text-foreground"
                onClick={handleViewDetails}
              >
                Open in Playground
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <ExamplesPreviewContainer className="size-full">
                <div className="flex size-full items-center justify-center p-8">
                  <QRCode
                    bgColor={styles.bgColor}
                    cornerEyeDotPattern={styles.cornerEyeDotPattern}
                    cornerEyePattern={styles.cornerEyePattern}
                    dotColor={styles.dotColor}
                    bodyPattern={styles.bodyPattern}
                    level={styles.level}
                    eyeColor={styles.eyeColor}
                    fgColor={styles.fgColor}
                    hideLogo={!styles.showLogo}
                    logo={styles.customLogo}
                    scale={4}
                    templateId={styles.templateId}
                    value={PREVIEW_VALUE}
                  />
                </div>
              </ExamplesPreviewContainer>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
