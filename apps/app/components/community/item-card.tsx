// A server component (no "use client"): page template cards render their
// page preview here, so the page itself never goes to the browser.

import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { Heart } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TemplatePreview } from "@/components/landing/template-preview";
import {
  type CommunityItemCard,
  itemPath,
  TYPE_LABELS,
  TYPE_SEGMENTS,
} from "@/lib/community/types";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_TEXT,
  ROW_CARD,
  ROW_CARDS,
} from "./card-layout";
import { CreatorLine } from "./creator-line";
import { LazyDesignQr } from "./design-qr";

const COUNT = new Intl.NumberFormat("en", { notation: "compact" });

/** Where a card goes: its item page, or the type's gallery (legacy themes). */
export const cardHref = (card: CommunityItemCard) =>
  card.slug
    ? itemPath(card.type, card.slug)
    : `/community/${TYPE_SEGMENTS[card.type]}`;

/**
 * One item in a grid or row: the design, its name, type and creator. The
 * design is drawn in the browser as the card nears the screen; `eager`
 * draws it in the server's HTML too (first-screen cards only: a framed
 * design is tens of kilobytes of SVG).
 */
export function ItemCard({
  card,
  className,
  eager = false,
}: {
  card: CommunityItemCard;
  className?: string;
  eager?: boolean;
}) {
  const t = useTranslations("community.itemCard");
  const stack = card.type === "collection" ? (card.stack ?? []) : [];
  // Page previews have links of their own, so the card's link is stretched
  // over the card instead of wrapping it (nested <a> is invalid HTML and
  // breaks hydration), as on the /templates gallery.
  return (
    <article
      className={cn(
        CARD_FRAME,
        "transition-[border-color,box-shadow]",
        "hover:border-foreground/15 hover:shadow-sm has-[a:focus-visible]:ring-ring/50 has-[a:focus-visible]:ring-[3px]",
        className,
      )}
    >
      <Link
        aria-label={`${card.name}, ${TYPE_LABELS[card.type].one}`}
        className="absolute inset-0 z-10 rounded-xl outline-none"
        href={cardHref(card)}
      />
      <div className={CARD_ART}>
        {card.type === "collection" ? (
          <div className="absolute inset-5 grid place-items-center">
            {stack.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                {t("empty")}
              </span>
            ) : (
              stack.map((style, index) => (
                <div
                  className="absolute grid aspect-square h-[78%] place-items-center rounded-lg bg-white p-2 shadow-sm ring-1 ring-black/5"
                  key={index}
                  style={{
                    transform: `translateX(${(index - (stack.length - 1) / 2) * 22}%) rotate(${(index - (stack.length - 1) / 2) * 5}deg)`,
                    zIndex: index,
                  }}
                >
                  {/* Only the front design of an eager card is in the
                      HTML; the ones behind it draw in the browser. */}
                  <LazyDesignQr
                    className="size-full"
                    eager={eager && index === stack.length - 1}
                    style={style}
                  />
                </div>
              ))
            )}
          </div>
        ) : card.type === "kit" ? (
          // The look and the page, side by side.
          <div className="absolute inset-0 flex items-start justify-center gap-3 px-5 pt-4">
            <div className="mt-6 aspect-square w-[38%] rounded-lg bg-white p-2 shadow-sm ring-1 ring-black/5">
              <LazyDesignQr
                className="size-full"
                eager={eager}
                style={card.preview}
              />
            </div>
            <div className="aspect-[9/16] w-[36%] overflow-hidden rounded-t-xl bg-white shadow-sm ring-1 ring-black/5">
              {card.page ? (
                <TemplatePreview
                  className="size-full"
                  content={card.page.content}
                />
              ) : null}
            </div>
          </div>
        ) : card.type === "page-template" ? (
          // The top of the page on a phone-sized screen, cropped by the box.
          <div className="absolute top-4 left-1/2 aspect-[9/16] w-[46%] -translate-x-1/2 overflow-hidden rounded-t-xl bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 group-hover:-translate-y-1">
            {card.page ? (
              <TemplatePreview
                className="size-full"
                content={card.page.content}
              />
            ) : null}
          </div>
        ) : (
          <div className="absolute inset-3 rounded-lg bg-white p-2.5 ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-[1.02]">
            <LazyDesignQr
              className="size-full"
              eager={eager}
              style={card.preview}
            />
          </div>
        )}
        {card.isOfficial && (
          <Badge
            className="bg-background/90 text-foreground absolute top-2 left-2 border px-1.5 py-0 text-[10px] shadow-xs"
            variant="outline"
          >
            {t("official")}
          </Badge>
        )}
      </div>
      <div className={CARD_TEXT}>
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{card.name}</span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {card.type === "collection" && card.itemCount !== undefined
              ? `${card.itemCount} ${card.itemCount === 1 ? "item" : "items"}`
              : TYPE_LABELS[card.type].one}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <CreatorLine creator={card.creator} link={false} />
          {(card.likeCount > 0 || card.useCount > 0) && (
            <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs tabular-nums">
              {card.likeCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Heart aria-label={t("likes")} className="size-3" />
                  {COUNT.format(card.likeCount)}
                </span>
              )}
              {card.useCount > 0 && (
                <span>
                  {t("usecountUses", { useCount: COUNT.format(card.useCount) })}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** A card's key in a list: unique across types. */
export const cardKey = (card: CommunityItemCard) =>
  `${card.type}-${card.slug || card.id}`;

/** A row's title and "See all", above its cards (`children`). */
export function ItemRowShell({
  title,
  badge,
  href,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("community.itemCard");
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
          {title}
          {badge}
        </h2>
        {href && (
          <Link
            className="text-muted-foreground hover:text-foreground text-sm"
            href={href}
          >
            {t("seeAll")}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A row's cards. */
export function ItemRowCards({ cards }: { cards: CommunityItemCard[] }) {
  return (
    <div className={ROW_CARDS}>
      {cards.map((card) => (
        <ItemCard card={card} className={ROW_CARD} key={cardKey(card)} />
      ))}
    </div>
  );
}

/** A titled row of cards (scrolls sideways on phones). */
export function ItemRow({
  title,
  badge,
  href,
  cards,
}: {
  title: string;
  badge?: React.ReactNode;
  href?: string;
  cards: CommunityItemCard[];
}) {
  if (cards.length === 0) return null;
  return (
    <ItemRowShell badge={badge} href={href} title={title}>
      <ItemRowCards cards={cards} />
    </ItemRowShell>
  );
}

/** Every card of a list, in a responsive grid. */
export function ItemGrid({
  cards,
  className = "grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  eager = 0,
}: {
  cards: CommunityItemCard[];
  /** The grid's columns (a gallery with a sidebar has less room) */
  className?: string;
  /** How many cards, from the first, draw their design on the server */
  eager?: number;
}) {
  return (
    <div className={className}>
      {cards.map((card, index) => (
        <ItemCard card={card} eager={index < eager} key={cardKey(card)} />
      ))}
    </div>
  );
}
