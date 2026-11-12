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
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { markChangelogSeen } from "@/actions/changelog";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import {
  type ChangelogItem,
  effectiveSeenAt,
  isUnread,
  newestDay,
  seenStorageKey,
  unreadCount,
} from "@/lib/changelog-feed";

/** The signed-in person's "seen up to" day, as the server has it. */
export interface WhatsNewSeen {
  viewerId: string;
  /** user.settings.changelogSeenAt */
  stored: string | null;
  /** Sign-up day: the start for someone who never opened the panel */
  signedUpAt: string | null;
}

interface WhatsNewValue {
  items: ChangelogItem[];
  /** Entries newer than what the person has seen (0 when signed out) */
  unread: number;
  openPanel: () => void;
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

function writeLocal(key: string, day: string) {
  try {
    window.localStorage.setItem(key, day);
  } catch {
    // Blocked storage: the account's copy still has it.
  }
}

/**
 * Holds the latest changelog entries and what the person has seen, and
 * renders the panel. Opening it marks everything released so far as seen,
 * in the account (user.settings) and in this browser, while the entries
 * that were new stay marked until it closes.
 */
export function WhatsNewProvider({
  items,
  seen,
  children,
}: {
  items: ChangelogItem[];
  /** Null when signed out or unknown: nothing is marked new */
  seen: WhatsNewSeen | null;
  children: ReactNode;
}) {
  const storageKey = seen ? seenStorageKey(seen.viewerId) : null;
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => setLocal(readLocal(storageKey)), [storageKey]);

  const seenAt = seen
    ? effectiveSeenAt({
        stored: seen.stored,
        local,
        signedUpAt: seen.signedUpAt,
      })
    : null;
  const unread = seen ? unreadCount(items, seenAt) : 0;

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

  return (
    <WhatsNewContext.Provider value={{ items, unread, openPanel }}>
      {children}
      <WhatsNewSheet
        items={items}
        markNew={Boolean(seen)}
        onOpenChange={setOpen}
        open={open}
        seenAt={shownFrom}
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

/** The entries, newest first; each opens its part of /changelogs. */
export function WhatsNewList({
  items,
  seenAt,
  markNew,
  onNavigate,
}: {
  items: ChangelogItem[];
  seenAt: string | null;
  /** Mark entries after `seenAt` as new */
  markNew: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("app.shell.whatsNew");
  return (
    <ol className="divide-y">
      {items.map((item) => {
        const fresh = markNew && isUnread(item, seenAt);
        return (
          <li key={item.slug}>
            <Link
              className="hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03] group block px-5 py-4 outline-none transition-colors"
              href={item.href}
              onClick={onNavigate}
            >
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                {fresh && (
                  <>
                    <span
                      aria-hidden
                      className="bg-primary size-1.5 shrink-0 rounded-full"
                    />
                    <span className="text-primary font-medium">{t("new")}</span>
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
}: {
  items: ChangelogItem[];
  seenAt: string | null;
  markNew: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}: {
  items: ChangelogItem[];
  seenAt: string | null;
  markNew: boolean;
  onNavigate?: () => void;
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
