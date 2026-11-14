"use client";
import { useTranslations } from "next-intl";

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
// Client branding (agency tools)
import { StatsBrandingSection } from "@/components/agency/stats-branding-section";
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
  const t = useTranslations("app.dashboard.codes.shareStatsDialog");
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
          on ? t("analyticsPageIsOn") : t("analyticsPageIsOff"),
          on
            ? { description: t("anyoneWithTheLinkCan") }
            : { description: t("itsLinkNoLongerWorks") },
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
        toast.success(t("newLinkMade"), {
          description: t("theOldLinkNoLonger"),
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shareAnalytics")}</DialogTitle>
          <DialogDescription>
            {t("aPublicReadOnlyPage", { name })}
          </DialogDescription>
        </DialogHeader>

        {share === null && !error ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : share && !share.available ? (
          <p className="bg-muted/50 text-muted-foreground rounded-md p-3 text-sm">
            {t("sharingAnalyticsIsntAvailableOn")}
          </p>
        ) : share ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor={`${id}-on`}>{t("publicAnalyticsPage")}</Label>
                <p className="text-muted-foreground text-xs">
                  {share.canManage
                    ? t("turnItOffAnyTime")
                    : t("onlyOwnersAndEditorsCan")}
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
                <Label htmlFor={`${id}-link`}>{t("link")}</Label>
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
                    successMessage={{ title: t("linkCopied") }}
                    textToCopy={share.url}
                  />
                  <Button asChild size="icon" variant="ghost">
                    <a
                      aria-label={t("openTheAnalyticsPage")}
                      href={share.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExportSquare />
                    </a>
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("searchEnginesDontIndexIt")}
                </p>
              </div>
            )}
            {/* Client branding (agency tools): once the page is on. */}
            {share.url && (
              <StatsBrandingSection codeId={code.id} onShareChange={setShare} />
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
              {t("resetLink")}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
