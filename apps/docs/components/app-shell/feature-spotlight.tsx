"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@repo/design-system/components/ui/popover";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { markSpotlightSeen } from "@/actions/spotlights";
import { appendRecent, storedList } from "@/lib/changelog-feed";
import {
  activeSpotlight,
  SPOTLIGHTS_LIMIT,
  type SpotlightId,
  spotlightStorageKey,
} from "@/lib/spotlights";
import { useDialogOpen } from "./open-dialogs";

interface SpotlightValue {
  seen: ReadonlySet<string>;
  markSeen: (id: SpotlightId) => void;
}

const SpotlightContext = createContext<SpotlightValue | null>(null);

function readList(key: string): string[] {
  try {
    return storedList(JSON.parse(window.localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Blocked storage: the account's copy still has it.
  }
}

/**
 * The spotlights the signed-in person has seen: the account's list
 * (user.settings.spotlightsSeen) and this browser's copy, which is read
 * before any spotlight shows. Without a viewer (signed out) none show.
 */
export function SpotlightProvider({
  viewerId,
  seen,
  children,
}: {
  viewerId: string | null;
  seen: readonly string[];
  children: ReactNode;
}) {
  const key = viewerId ? spotlightStorageKey(viewerId) : null;
  // Null until this browser's copy is read.
  const [local, setLocal] = useState<string[] | null>(null);
  useEffect(() => setLocal(key ? readList(key) : null), [key]);

  const all = useMemo(
    () => new Set([...seen, ...(local ?? [])]),
    [seen, local],
  );
  const markSeen = useCallback(
    (id: SpotlightId) => {
      if (!key || all.has(id)) return;
      const next = appendRecent(local ?? [], [id], SPOTLIGHTS_LIMIT);
      setLocal(next);
      writeList(key, next);
      // This browser already counts it seen if the write fails.
      markSpotlightSeen(id).catch(() => undefined);
    },
    [all, key, local],
  );
  const value = useMemo(
    () => (local === null ? null : { seen: all, markSeen }),
    [all, local, markSeen],
  );

  return (
    <SpotlightContext.Provider value={value}>
      {children}
    </SpotlightContext.Provider>
  );
}

// The spotlights waiting on this page, in the order they mounted: only the
// first one shows; the next shows once it's dismissed.
let waiting: readonly string[] = [];
const listeners = new Set<() => void>();
const NONE: readonly string[] = [];

function setWaiting(next: readonly string[]) {
  waiting = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A beat after the page appears before a spotlight opens. */
const SETTLE_MS = 800;

/**
 * Points at a new control once: a tiny dot on it, and beside it a small
 * popover ("New", one line, "Got it"). Dismissing the popover or using the
 * control stores it as seen (user.settings.spotlightsSeen and this
 * browser), and the dot goes. One spotlight shows at a time, never over an
 * open dialog or sheet. Add its id to lib/spotlights.ts first.
 */
export function FeatureSpotlight({
  id,
  description,
  enabled = true,
  side = "bottom",
  align = "center",
  className,
  children,
}: {
  id: SpotlightId;
  /** One line on what's new */
  description: string;
  /** False where the control doesn't apply to this person */
  enabled?: boolean;
  /** Where the popover sits on wider screens; on phones it's always below */
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** For the wrapper around the control */
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("app.shell.spotlight");
  const spotlights = useContext(SpotlightContext);
  const pending = Boolean(spotlights && enabled && !spotlights.seen.has(id));

  useEffect(() => {
    if (!pending) return;
    setWaiting([...waiting.filter((other) => other !== id), id]);
    return () => setWaiting(waiting.filter((other) => other !== id));
  }, [id, pending]);
  const queue = useSyncExternalStore(
    subscribe,
    () => waiting,
    () => NONE,
  );

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const dialogOpen = useDialogOpen();
  const isMobile = useIsMobile();

  const showing =
    pending &&
    settled &&
    !dialogOpen &&
    activeSpotlight(queue, spotlights?.seen ?? new Set()) === id;
  const done = () => spotlights?.markSeen(id);

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) done();
      }}
      open={showing}
    >
      <PopoverAnchor asChild>
        <span
          className={cn("relative inline-flex", className)}
          onClickCapture={pending ? done : undefined}
        >
          {children}
          {pending && (
            <span
              aria-hidden
              className="bg-primary ring-background pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2"
            />
          )}
        </span>
      </PopoverAnchor>
      <PopoverContent
        align={align}
        className="w-72 p-3.5"
        collisionPadding={16}
        data-spotlight=""
        // It sits beside the control without taking focus or closing on
        // clicks elsewhere; Escape and "Got it" dismiss it.
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side={isMobile ? "bottom" : side}
        sideOffset={8}
      >
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <span aria-hidden className="bg-primary size-1.5 rounded-full" />
          {t("new")}
        </p>
        <p className="mt-1.5 text-sm text-pretty">{description}</p>
        <div className="mt-3 flex justify-end">
          <Button onClick={done} size="sm" variant="outline">
            {t("gotIt")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
