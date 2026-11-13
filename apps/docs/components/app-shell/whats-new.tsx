"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dismissWhatsNew,
  markChangelogEntrySeen,
  markChangelogSeen,
} from "@/actions/changelog";
import { ChangelogPicture } from "@/components/changelog/changelog-picture";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import {
  appendRecent,
  type ChangelogItem,
  dismissedStorageKey,
  effectiveSeenAt,
  featureCards,
  isUnread,
  newestDay,
  pickAnnouncement,
  seenStorageKey,
  storedList,
  unreadCount,
} from "@/lib/changelog-feed";
import { anotherDialogOpen } from "./open-dialogs";
import { WhatsNewModal } from "./whats-new-modal";

/** The signed-in person's "What's new" state, as the server has it. */
export interface WhatsNewSeen {
  viewerId: string;
  /** user.settings.changelogSeenAt */
  stored: string | null;
  /** Sign-up day: the start for someone who never opened the panel */
  signedUpAt: string | null;
  /** user.settings.whatsNewDismissed */
  dismissed: string[];
  /** user.settings.spotlightsSeen (components/app-shell/feature-spotlight.tsx) */
  spotlights: string[];
}

interface WhatsNewValue {
  items: ChangelogItem[];
  /** Entries newer than what the person has seen (0 when signed out) */
  unread: number;
  openPanel: () => void;
  /** The sidebar's feature cards, newest first */
  cards: ChangelogItem[];
  /** Opens an entry's modal */
  openEntry: (slug: string) => void;
  /** Hides an entry's card for good */
  dismiss: (slug: string) => void;
}

const WhatsNewContext = createContext<WhatsNewValue | null>(null);

/** The app shell's "What's new"; null outside it. */
export function useWhatsNew(): WhatsNewValue | null {
  return useContext(WhatsNewContext);
}

function readLocal(key: string | null): string | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the account's copy still has it.
  }
}

function readList(key: string): string[] {
  try {
    return storedList(JSON.parse(readLocal(key) ?? "[]"));
  } catch {
    return [];
  }
}

// One announcement per visit (this tab), even if storing it failed.
const ANNOUNCED_KEY = "qrdx:whats-new-announced";
/** How long the page settles before an announcement opens. */
const ANNOUNCE_DELAY_MS = 1500;
/** Tries while another dialog is open before giving up for this visit. */
const ANNOUNCE_TRIES = 20;

function announcedThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(ANNOUNCED_KEY) !== null;
  } catch {
    return false;
  }
}

function markAnnouncedThisVisit(slug: string) {
  try {
    window.sessionStorage.setItem(ANNOUNCED_KEY, slug);
  } catch {
    // Blocked storage: the dismissal stored on close still holds.
  }
}

/**
 * Holds the latest changelog entries and what the person has seen, and
 * renders the panel and the entry modal. Opening the panel marks everything
 * released so far as seen, in the account (user.settings) and in this
 * browser, while the entries that were new stay marked until it closes;
 * opening one entry marks it (and older ones) seen. Dismissed cards are
 * remembered the same way. An entry marked `announce` opens by itself once
 * (pickAnnouncement), never over another dialog.
 */
export function WhatsNewProvider({
  items,
  seen,
  today,
  bodies = {},
  children,
}: {
  items: ChangelogItem[];
  /** Null when signed out or unknown: nothing is marked new */
  seen: WhatsNewSeen | null;
  /** The server's UTC day, so the cards render the same on both sides */
  today: string;
  /** Each entry's release notes, rendered on the server */
  bodies?: Record<string, ReactNode>;
  children: ReactNode;
}) {
  const storageKey = seen ? seenStorageKey(seen.viewerId) : null;
  const dismissedKey = dismissedStorageKey(seen?.viewerId ?? null);
  const [local, setLocal] = useState<string | null>(null);
  const [localDismissed, setLocalDismissed] = useState<string[]>([]);
  // This browser's copies are read: announcements wait for them.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLocal(readLocal(storageKey));
    setLocalDismissed(readList(dismissedKey));
    setLoaded(true);
  }, [storageKey, dismissedKey]);

  const seenAt = seen
    ? effectiveSeenAt({
        stored: seen.stored,
        local,
        signedUpAt: seen.signedUpAt,
      })
    : null;
  const unread = seen ? unreadCount(items, seenAt) : 0;

  const serverDismissed = seen?.dismissed;
  const dismissed = useMemo(
    () => appendRecent(serverDismissed ?? [], localDismissed),
    [serverDismissed, localDismissed],
  );
  const cards = useMemo(
    () => featureCards(items, { dismissed, today }),
    [items, dismissed, today],
  );

  const [open, setOpen] = useState(false);
  // The day the panel counts "new" from while it's open.
  const [shownFrom, setShownFrom] = useState<string | null>(null);

  const openPanel = useCallback(() => {
    setShownFrom(seenAt);
    setOpen(true);
    const newest = newestDay(items);
    if (!(storageKey && newest && unread > 0)) return;
    setLocal(newest);
    writeLocal(storageKey, newest);
    // This browser already counts them seen if the write fails.
    markChangelogSeen().catch(() => undefined);
  }, [items, seenAt, storageKey, unread]);

  const dismiss = useCallback(
    (slug: string) => {
      const next = appendRecent(localDismissed, [slug]);
      setLocalDismissed(next);
      writeLocal(dismissedKey, JSON.stringify(next));
      if (seen) dismissWhatsNew([slug]).catch(() => undefined);
    },
    [dismissedKey, localDismissed, seen],
  );

  // The entry modal: which entry, and the announced one (closing it counts
  // as done with it).
  const [entry, setEntry] = useState<{
    slug: string;
    announced: string | null;
  } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openEntry = useCallback((slug: string) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEntry({ slug, announced: null });
  }, []);
  const closeEntry = useCallback(() => {
    if (entry?.announced) dismiss(entry.announced);
    setEntry(null);
  }, [dismiss, entry]);

  // An opened entry counts as seen, with everything released before it.
  const openSlug = entry?.slug ?? null;
  useEffect(() => {
    const item = items.find((candidate) => candidate.slug === openSlug);
    if (!(item && storageKey && isUnread(item, seenAt))) return;
    setLocal(item.date);
    writeLocal(storageKey, item.date);
    markChangelogEntrySeen(item.slug).catch(() => undefined);
  }, [items, openSlug, seenAt, storageKey]);

  const announcement =
    loaded && seen
      ? (pickAnnouncement(items, {
          today,
          signedUpAt: seen.signedUpAt,
          seenAt,
          dismissed,
        })?.slug ?? null)
      : null;
  useEffect(() => {
    if (!announcement || announcedThisVisit()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (anotherDialogOpen()) {
        if (tries >= ANNOUNCE_TRIES) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      markAnnouncedThisVisit(announcement);
      opener.current = null;
      setEntry({ slug: announcement, announced: announcement });
    }, ANNOUNCE_DELAY_MS);
    return () => window.clearInterval(timer);
  }, [announcement]);

  const value = useMemo(
    () => ({ items, unread, openPanel, cards, openEntry, dismiss }),
    [items, unread, openPanel, cards, openEntry, dismiss],
  );

  return (
    <WhatsNewContext.Provider value={value}>
      {children}
      <WhatsNewSheet
        items={items}
        markNew={Boolean(seen)}
        onOpenChange={setOpen}
        onOpenEntry={openEntry}
        open={open}
        seenAt={shownFrom}
      />
      <WhatsNewModal
        bodies={bodies}
        items={items}
        onClose={closeEntry}
        onSlugChange={(slug) =>
          setEntry((current) => current && { ...current, slug })
        }
        returnFocus={opener}
        slug={entry?.slug ?? null}
      />
    </WhatsNewContext.Provider>
  );
}

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const formatDay = (day: string) => DAY.format(new Date(`${day}T00:00:00Z`));

/** A plain click (not one asking for a new tab or window). */
const plainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

/**
 * The entries, newest first. Each opens its modal (with `onOpenEntry`), or
 * its part of /changelogs in a new tab.
 */
export function WhatsNewList({
  items,
  seenAt,
  markNew,
  onNavigate,
  onOpenEntry,
}: {
  items: ChangelogItem[];
  seenAt: string | null;
  /** Mark entries after `seenAt` as new */
  markNew: boolean;
  onNavigate?: () => void;
  onOpenEntry?: (slug: string) => void;
}) {
  const t = useTranslations("app.shell.whatsNew");
  return (
    <ol className="divide-y">
      {items.map((item) => {
        const fresh = markNew && isUnread(item, seenAt);
        return (
          <li key={item.slug}>
            <Link
              className="hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03] group flex gap-4 px-5 py-4 outline-none transition-colors"
              href={item.href}
              onClick={(event) => {
                if (onOpenEntry && plainClick(event)) {
                  event.preventDefault();
                  onOpenEntry(item.slug);
                  return;
                }
                onNavigate?.();
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  {fresh && (
                    <>
                      <span
                        aria-hidden
                        className="bg-primary size-1.5 shrink-0 rounded-full"
                      />
                      <span className="text-primary font-medium">
                        {t("new")}
                      </span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <time dateTime={item.date}>{formatDay(item.date)}</time>
                  {item.version && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">v{item.version}</span>
                    </>
                  )}
                </p>
                <p className="mt-1.5 text-sm font-medium text-balance group-hover:underline group-hover:decoration-foreground/30 group-hover:underline-offset-4">
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-muted-foreground mt-1 line-clamp-3 text-sm text-pretty">
                    {item.description}
                  </p>
                )}
              </div>
              {item.image && (
                <div className="bg-muted relative mt-0.5 aspect-video w-20 shrink-0 self-start overflow-hidden rounded-md border">
                  <ChangelogPicture
                    alt=""
                    darkSrc={item.imageDark}
                    sizes="5rem"
                    src={item.image}
                  />
                </div>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The side panel: docked on the right on wider screens, a bottom sheet on
 * phones (like the playground's community sheet). Clicking outside closes it.
 */
export function WhatsNewSheet({
  items,
  seenAt,
  markNew,
  open,
  onOpenChange,
  onOpenEntry,
}: {
  items: ChangelogItem[];
  seenAt: string | null;
  markNew: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenEntry?: (slug: string) => void;
}) {
  const isMobile = useIsMobile();
  const close = () => onOpenChange(false);
  return (
    <Sheet modal={false} onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={cn(
          "gap-0 p-0",
          isMobile
            ? "h-[72svh] rounded-t-2xl"
            : "w-full sm:max-w-[25rem] md:shadow-xl",
        )}
        side={isMobile ? "bottom" : "right"}
      >
        <WhatsNewPanel
          items={items}
          markNew={markNew}
          onNavigate={close}
          onOpenEntry={onOpenEntry}
          seenAt={seenAt}
        />
      </SheetContent>
    </Sheet>
  );
}

/** Header, list and footer, inside the sheet. */
export function WhatsNewPanel({
  items,
  seenAt,
  markNew,
  onNavigate,
  onOpenEntry,
}: {
  items: ChangelogItem[];
  seenAt: string | null;
  markNew: boolean;
  onNavigate?: () => void;
  onOpenEntry?: (slug: string) => void;
}) {
  const t = useTranslations("app.shell.whatsNew");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b px-5 py-4 pr-12">
        <SheetTitle>{t("whatsNew")}</SheetTitle>
        <SheetDescription>{t("newFeaturesAndFixesIn")}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <WhatsNewList
          items={items}
          markNew={markNew}
          onNavigate={onNavigate}
          onOpenEntry={onOpenEntry}
          seenAt={seenAt}
        />
      </div>
      <div className="border-t p-4">
        <Button asChild className="w-full" variant="outline">
          <Link href="/changelogs" onClick={onNavigate}>
            {t("seeAllUpdates")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
