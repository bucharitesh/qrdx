"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import useMediaQuery from "@repo/design-system/hooks/use-media-query";
import { ArrowLeft2, ArrowRight2 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { ChangelogPicture } from "@/components/changelog/changelog-picture";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import type { ChangelogItem } from "@/lib/changelog-feed";

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * One changelog entry in a dialog: its picture or clip, date and tags, title,
 * description and release notes (rendered on the server, as on
 * /changelogs), "Try it" when it has a link into the app, and the way to
 * the full changelog. The arrows and Left/Right step through the entries.
 */
export function WhatsNewModal({
  items,
  slug,
  bodies,
  onSlugChange,
  onClose,
  returnFocus,
}: {
  items: ChangelogItem[];
  /** The open entry; null when closed */
  slug: string | null;
  /** Release notes by slug */
  bodies: Record<string, ReactNode>;
  onSlugChange: (slug: string) => void;
  onClose: () => void;
  /** Where focus goes back to when it closes */
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("app.shell.whatsNew");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const index = slug ? items.findIndex((item) => item.slug === slug) : -1;
  const item = index >= 0 ? items[index] : undefined;
  // The last entry stays in place while the dialog fades out.
  const last = useRef(item);
  if (item) last.current = item;
  const shown = item ?? last.current;

  const scrollRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: back to the top for each entry
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [slug]);

  const step = (delta: number) => {
    const next = items[index + delta];
    if (next) onSlugChange(next.slug);
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={item !== undefined}
    >
      <DialogContent
        className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          const target = returnFocus.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
          // Code blocks and the like scroll sideways with the arrows.
          const target = event.target as HTMLElement;
          if (target.closest("pre, input, textarea, [contenteditable]")) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        showCloseButton={false}
      >
        {shown && (
          <>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
              ref={scrollRef}
            >
              {(shown.video || shown.image) && (
                <div className="bg-muted relative aspect-video overflow-hidden border-b">
                  {shown.video ? (
                    <video
                      autoPlay={!reduceMotion}
                      className="size-full object-cover"
                      controls={reduceMotion === true}
                      key={shown.video}
                      loop
                      muted
                      playsInline
                      poster={shown.image}
                      preload="metadata"
                      src={shown.video}
                    />
                  ) : (
                    shown.image && (
                      <ChangelogPicture
                        alt={shown.imageAlt ?? ""}
                        darkSrc={shown.imageDark}
                        key={shown.slug}
                        sizes="(min-width: 640px) 672px, 100vw"
                        src={shown.image}
                      />
                    )
                  )}
                </div>
              )}
              <div className="px-5 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-7">
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                  <time dateTime={shown.date}>
                    {DAY.format(new Date(`${shown.date}T00:00:00Z`))}
                  </time>
                  {shown.version && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">v{shown.version}</span>
                    </>
                  )}
                </p>
                <DialogTitle className="mt-2 pr-8 text-xl leading-snug font-semibold tracking-tight text-balance">
                  {shown.title}
                </DialogTitle>
                <DialogDescription className="mt-2 text-pretty">
                  {shown.description}
                </DialogDescription>
                {shown.tags.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {shown.tags.map((tag) => (
                      <li
                        className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
                        key={tag}
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="bg-border my-5 h-px" />
                {bodies[shown.slug]}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2.5 sm:px-4">
              <div className="flex items-center">
                <Button
                  aria-label={t("previousUpdate")}
                  className="size-8"
                  disabled={index <= 0}
                  onClick={() => step(-1)}
                  size="icon"
                  variant="ghost"
                >
                  <ArrowLeft2 aria-hidden className="size-4" />
                </Button>
                <span className="text-muted-foreground min-w-12 text-center text-xs tabular-nums">
                  {t("positionOfTotal", {
                    position: index + 1,
                    total: items.length,
                  })}
                </span>
                <Button
                  aria-label={t("nextUpdate")}
                  className="size-8"
                  disabled={index < 0 || index >= items.length - 1}
                  onClick={() => step(1)}
                  size="icon"
                  variant="ghost"
                >
                  <ArrowRight2 aria-hidden className="size-4" />
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  asChild
                  size="sm"
                  variant={shown.cta ? "ghost" : "outline"}
                >
                  <Link href={shown.href} onClick={onClose}>
                    {t("readOnTheChangelog")}
                  </Link>
                </Button>
                {shown.cta && (
                  <Button asChild size="sm">
                    <Link href={shown.cta.href} onClick={onClose}>
                      {shown.cta.label ?? t("tryIt")}
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <DialogClose
              aria-label={t("close")}
              className="bg-background/85 text-foreground hover:bg-background focus-visible:ring-ring/50 absolute top-3 right-3 grid size-8 place-items-center rounded-full border shadow-xs outline-none backdrop-blur-sm transition-colors focus-visible:ring-[3px]"
            >
              <Close aria-hidden className="size-4" />
            </DialogClose>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
