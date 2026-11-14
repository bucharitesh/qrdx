"use client";

import { Close } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ChangelogPicture } from "@/components/changelog/changelog-picture";
import type { ChangelogItem } from "@/lib/changelog-feed";
import { useWhatsNew } from "./whats-new";

// Where each card sits: the top one in full, the next two peeking out above
// it, smaller. Hovering or focusing the stack fans them out far enough to
// read their titles.
const DEPTH = [
  "translate-y-0 scale-100",
  "-translate-y-2 scale-[0.95] group-hover/cards:-translate-y-11 group-hover/cards:scale-[0.97] group-focus-within/cards:-translate-y-11 group-focus-within/cards:scale-[0.97]",
  "-translate-y-4 scale-[0.9] group-hover/cards:-translate-y-22 group-hover/cards:scale-[0.94] group-focus-within/cards:-translate-y-22 group-focus-within/cards:scale-[0.94]",
];

/** How long a dismissed card takes to slide away. */
const LEAVE_MS = 200;

/**
 * New features in the sidebar: the newest changelog entries with a picture
 * that the person hasn't dismissed (featureCards in lib/changelog-feed.ts),
 * as a small stack. A card opens its entry's modal; the cross hides it for
 * good. Hidden on short screens, where the nav needs the room.
 */
export function WhatsNewCards({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.shell.whatsNew");
  const whatsNew = useWhatsNew();
  const [leaving, setLeaving] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Set when the dismissed card had focus: it moves to the next card.
  const refocus = useRef(false);
  const cards = whatsNew?.cards;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a card goes
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    listRef.current?.querySelector<HTMLElement>("[data-card-open]")?.focus();
  }, [cards]);

  if (!(whatsNew && cards && cards.length > 0)) return null;
  const { openEntry, dismiss } = whatsNew;

  const remove = (slug: string) => {
    refocus.current =
      listRef.current?.contains(document.activeElement) ?? false;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      dismiss(slug);
      return;
    }
    setLeaving(slug);
    window.setTimeout(() => {
      dismiss(slug);
      setLeaving(null);
    }, LEAVE_MS);
  };

  // The card sliding away keeps its place on top; the rest move up now.
  const staying = cards.filter((card) => card.slug !== leaving);

  return (
    <section
      aria-label={t("newFeatures")}
      className={cn(
        "group/cards relative z-10 transition-[padding] duration-300 motion-reduce:transition-none [@media(max-height:44rem)]:hidden",
        // Room for the cards peeking out behind the top one.
        ["", "pt-2", "pt-4"][staying.length - 1],
      )}
    >
      <ul className="grid" ref={listRef}>
        {cards.map((card) => {
          const gone = card.slug === leaving;
          const depth = gone ? 0 : staying.indexOf(card);
          return (
            <li
              className={cn(
                "origin-top transition-[translate,scale,opacity] duration-300 ease-out [grid-area:1/1] motion-reduce:transition-none",
                gone
                  ? "-translate-x-[110%] opacity-0 duration-200 ease-in"
                  : DEPTH[depth],
              )}
              key={card.slug}
              style={{ zIndex: gone ? cards.length + 1 : cards.length - depth }}
            >
              <FeatureCard
                card={card}
                dismissLabel={t("dismissTitle", { title: card.title })}
                onDismiss={
                  depth === 0 && !gone ? () => remove(card.slug) : null
                }
                onOpen={() => {
                  onNavigate?.();
                  openEntry(card.slug);
                }}
                top={depth === 0}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FeatureCard({
  card,
  top,
  onOpen,
  onDismiss,
  dismissLabel,
}: {
  card: ChangelogItem;
  top: boolean;
  onOpen: () => void;
  /** Present on the top card only */
  onDismiss: (() => void) | null;
  dismissLabel: string;
}) {
  return (
    <div className="bg-background relative h-full overflow-hidden rounded-lg border shadow-xs">
      {/* Covers the card; the cross sits above it. */}
      <button
        aria-label={card.title}
        className="hover:bg-foreground/[0.02] focus-visible:ring-ring/50 absolute inset-0 rounded-lg outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset"
        data-card-open={top ? "" : undefined}
        onClick={onOpen}
        type="button"
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none relative p-2.5 transition-opacity duration-300 motion-reduce:transition-none",
          !top &&
            "opacity-50 group-focus-within/cards:opacity-100 group-hover/cards:opacity-100",
        )}
      >
        {/* Two lines tall on every card, so the stack lines up; the cards
            behind start at the top, where their title peeks out. */}
        <div
          className={cn(
            "flex min-h-9 pr-6",
            top ? "items-center" : "items-start",
          )}
        >
          <p className="line-clamp-2 text-[13px] leading-[18px] font-medium text-pretty">
            {card.title}
          </p>
        </div>
        {card.image && (
          <div className="bg-muted relative mt-2 aspect-video overflow-hidden rounded-md border">
            <ChangelogPicture
              alt=""
              darkSrc={card.imageDark}
              sizes="16rem"
              src={card.image}
            />
          </div>
        )}
        {card.description && (
          <p className="text-muted-foreground mt-2 truncate text-xs">
            {card.description}
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          aria-label={dismissLabel}
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] focus-visible:ring-ring/50 absolute top-2 right-2 grid size-6 place-items-center rounded-md outline-none transition-colors focus-visible:ring-[3px]"
          onClick={onDismiss}
          type="button"
        >
          <Close aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}
