"use client";

// "Share analytics…" from a code's row menu: turns the code's public,
// read-only analytics page (/stats/<token>, lib/public-stats.ts) on or off,
// copies its link and resets it.

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { Switch } from "@repo/design-system/components/ui/switch";
import { ExportSquare, Refresh2 } from "iconsax-reactjs";
import { useEffect, useId, useState, useTransition } from "react";
import {
  getPublicStatsShareAction,
  resetPublicStatsShareAction,
  setPublicStatsShareAction,
} from "@/actions/public-stats";
import { CopyButton } from "@/components/copy-button";
import type { PublicStatsShare } from "@/lib/public-stats-shared";

export function ShareStatsDialog({
  code,
  open,
  onOpenChange,
}: {
  code: { id: string; title: string | null; shortLink: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [share, setShare] = useState<PublicStatsShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShare(null);
    setError(null);
    getPublicStatsShareAction({ codeId: code.id })
      .then((result) => {
        if (cancelled) return;
        if (result.success) setShare(result.data);
        else setError(result.error.message);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load sharing. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, code.id]);

  const toggle = (on: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setPublicStatsShareAction({
          codeId: code.id,
          on,
        });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        setShare(result.data);
        toast.success(
          on ? "Analytics page is on" : "Analytics page is off",
          on
            ? { description: "Anyone with the link can see it." }
            : { description: "Its link no longer works." },
        );
      } catch {
        setError("Couldn't change sharing. Try again.");
      }
    });
  };

  const reset = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resetPublicStatsShareAction({ codeId: code.id });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        setShare(result.data);
        toast.success("New link made", {
          description: "The old link no longer works.",
        });
      } catch {
        setError("Couldn't reset the link. Try again.");
      }
    });
  };

  const on = Boolean(share?.url);
  const name = code.title?.trim() || code.shortLink;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share analytics</DialogTitle>
          <DialogDescription>
            A public, read-only page for {name}: scans over time, top countries,
            devices and referrers. It never shows the destination's details or
            anything about the people who scanned.
          </DialogDescription>
        </DialogHeader>

        {share === null && !error ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : share && !share.available ? (
          <p className="bg-muted/50 text-muted-foreground rounded-md p-3 text-sm">
            Sharing analytics isn't available on this server yet.
          </p>
        ) : share ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor={`${id}-on`}>Public analytics page</Label>
                <p className="text-muted-foreground text-xs">
                  {share.canManage
                    ? "Turn it off any time; the link stops working at once."
                    : "Only owners and editors can change this."}
                </p>
              </div>
              <Switch
                checked={on}
                disabled={isPending || !share.canManage}
                id={`${id}-on`}
                onCheckedChange={toggle}
              />
            </div>
            {share.url && (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-link`}>Link</Label>
                <div className="flex items-center gap-1">
                  <Input
                    className="font-mono text-xs"
                    id={`${id}-link`}
                    onFocus={(event) => event.currentTarget.select()}
                    readOnly
                    value={share.url}
                  />
                  <CopyButton
                    className="size-9 shrink-0 [&>svg]:size-4"
                    successMessage={{ title: "Link copied" }}
                    textToCopy={share.url}
                  />
                  <Button asChild size="icon" variant="ghost">
                    <a
                      aria-label="Open the analytics page"
                      href={share.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExportSquare />
                    </a>
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Search engines don't index it. Numbers can be up to 5 minutes
                  old.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {share?.url && share.canManage ? (
            <Button
              disabled={isPending}
              onClick={reset}
              type="button"
              variant="ghost"
            >
              <Refresh2 />
              Reset link
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => onOpenChange(false)} type="button">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
