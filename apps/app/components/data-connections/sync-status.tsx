"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { SyncState } from "@repo/integrations";
import { useTranslations } from "next-intl";
import type { Translator } from "@/lib/i18n/translator";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "4 minutes ago" / "in 3 minutes" */
export function timeFrom(
  iso: string | null,
  now = Date.now(),
  t: Translator<"editor.connections.syncStatus">,
): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return seconds <= 0 ? t("justNow") : t("inAMoment");
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}

const LABELS: Record<SyncState["status"], string> = {
  idle: "Waiting for new data",
  ok: "In sync",
  retrying: "Retrying",
  failed: "Stopped after repeated errors",
  paused: "Off",
};

const DOTS: Record<SyncState["status"], string> = {
  idle: "bg-muted-foreground/50",
  ok: "bg-emerald-500",
  retrying: "bg-amber-500",
  failed: "bg-destructive",
  paused: "bg-muted-foreground/40",
};

interface SyncStatusProps {
  state: SyncState | null;
  /** What is synced, e.g. "responses" or "scans" */
  noun: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Last sync, totals and the last error (never personal data). */
export function SyncStatus({
  state,
  noun,
  onRetry,
  retrying,
}: SyncStatusProps) {
  const t = useTranslations("editor.connections.syncStatus");
  if (!state) return null;
  const status = state.enabled ? state.status : "paused";
  return (
    <div className="space-y-2 rounded-lg border p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", DOTS[status])}
          />
          {LABELS[status]}
        </p>
        {onRetry && (status === "failed" || status === "retrying") && (
          <Button
            disabled={retrying}
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            {retrying && <ModuleOrbit aria-hidden className="size-3.5" />}
            {t("retryNow")}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">{t("lastSync")}</dt>
          <dd className="font-medium">
            {timeFrom(state.lastSuccessAt, undefined, t)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("sent")}</dt>
          <dd className="font-medium tabular-nums">
            {state.delivered.toLocaleString()} {noun}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("skipped")}</dt>
          <dd className="font-medium tabular-nums">
            {state.skipped.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {status === "retrying" ? t("nextTry") : t("lastTry")}
          </dt>
          <dd className="font-medium">
            {status === "retrying"
              ? timeFrom(state.nextAttemptAt, undefined, t)
              : timeFrom(state.lastAttemptAt, undefined, t)}
          </dd>
        </div>
      </dl>
      {state.lastError && status !== "ok" && (
        <p className="text-muted-foreground text-xs text-pretty">
          {t("lastError")} {state.lastError}
          {status === "retrying"
            ? t("tryAttemptsOf8", { attempts: state.attempts })
            : ""}
          .
        </p>
      )}
    </div>
  );
}
