"use client";

import { Info } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { cn } from "@repo/design-system/lib/utils";
import {
  MessageQuestion as CircleHelp,
  ExportSquare as ExternalLink,
  Flag,
  RotateRight as RotateCw,
  ShieldCross as ShieldAlert,
  ShieldTick as ShieldCheck,
  Warning2 as TriangleAlert,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { OpenButton, type OpenConfirmation } from "./confirm-open";
import {
  checkLink,
  type FindingSeverity,
  type LinkCheckResult,
  type LinkVerdict,
} from "./link-check";
import { CopyButton } from "./ui";

type State =
  | { phase: "checking" }
  | { phase: "done"; result: LinkCheckResult }
  /** `offline`, or the error's own message (from the check API). */
  | { phase: "error"; message: string | null };

/** Each verdict's title and body are in the catalog: scanner.link.verdicts.<verdict>. */
const VERDICTS: Record<
  LinkVerdict,
  { icon: typeof ShieldCheck; tone: string }
> = {
  verified: {
    icon: ShieldCheck,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  },
  ok: {
    icon: ShieldCheck,
    tone: "border-border bg-muted/40",
  },
  caution: {
    icon: TriangleAlert,
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  },
  danger: {
    icon: ShieldAlert,
    tone: "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100",
  },
  unknown: {
    icon: CircleHelp,
    tone: "border-border bg-muted/40",
  },
};

const SEVERITY_ICONS: Record<FindingSeverity, ReactNode> = {
  danger: (
    <ShieldAlert
      aria-hidden
      className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
    />
  ),
  warning: (
    <TriangleAlert
      aria-hidden
      className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
    />
  ),
  info: (
    <Info
      aria-hidden
      className="text-muted-foreground mt-0.5 size-4 shrink-0"
    />
  ),
};

/** The address with its host emphasized, since the host is what decides trust. */
export function Address({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  let parts: { before: string; host: string; after: string } | null = null;
  try {
    const parsed = new URL(url);
    const index = url.indexOf(parsed.host);
    if (parsed.host && index !== -1) {
      parts = {
        before: url.slice(0, index),
        host: url.slice(index, index + parsed.host.length),
        after: url.slice(index + parsed.host.length),
      };
    }
  } catch {
    // Not a URL: shown as-is.
  }
  return (
    <p className={cn("font-mono text-sm break-all", className)}>
      {parts ? (
        <>
          <span className="text-muted-foreground">{parts.before}</span>
          <span className="font-semibold text-foreground">{parts.host}</span>
          <span className="text-muted-foreground">{parts.after}</span>
        </>
      ) : (
        url
      )}
    </p>
  );
}

function openConfirmation(
  state: State,
  t: ReturnType<typeof useTranslations<"scanner.link">>,
  extra?: OpenConfirmation | null,
): OpenConfirmation | null {
  if (state.phase === "done" && state.result.verdict === "danger") {
    return {
      title: t("dangerTitle"),
      description: <p>{t("dangerBody")}</p>,
      action: t("openAnyway"),
    };
  }
  if (state.phase === "error") {
    return {
      title: t("uncheckedTitle"),
      description: <p>{t("uncheckedBody")}</p>,
      action: t("open"),
    };
  }
  return extra ?? null;
}

export function LinkPreview({
  url,
  confirm,
  openLabel,
}: {
  url: string;
  /** Extra confirmation before opening (payment links). */
  confirm?: OpenConfirmation;
  /** "Open link" by default. */
  openLabel?: string;
}) {
  const t = useTranslations("scanner.link");
  const [state, setState] = useState<State>({ phase: "checking" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the check on retry
  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "checking" });
    checkLink(url, controller.signal)
      .then((result) => setState({ phase: "done", result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          phase: "error",
          message:
            error instanceof Error && navigator.onLine ? error.message : null,
        });
      });
    return () => controller.abort();
  }, [url, attempt]);

  const verdictKey: LinkVerdict | null =
    state.phase === "done"
      ? state.result.verdict
      : state.phase === "error"
        ? "unknown"
        : null;
  const verdict = verdictKey ? VERDICTS[verdictKey] : null;
  const result = state.phase === "done" ? state.result : null;
  const redirects = result ? result.hops.length - 1 : 0;
  const reportHref = `/report-abuse?url=${encodeURIComponent(url)}`;

  return (
    <div className="flex flex-col gap-3">
      <Address url={url} />

      <div
        aria-live="polite"
        className={cn(
          "flex gap-3 rounded-lg border p-3 text-sm",
          verdict?.tone ?? "border-border bg-muted/40",
        )}
      >
        {verdict ? (
          <verdict.icon aria-hidden className="mt-0.5 size-5 shrink-0" />
        ) : (
          <ModuleOrbit aria-hidden className="mt-0.5 size-5 shrink-0" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {verdictKey ? t(`verdicts.${verdictKey}.title`) : t("checking")}
          </p>
          <p className="opacity-80">
            {state.phase === "error"
              ? `${state.message ?? t("offline")} ${t("verdicts.unknown.body")}`
              : verdictKey
                ? t(`verdicts.${verdictKey}.body`)
                : t("checkingBody")}
          </p>
        </div>
      </div>

      {result &&
        result.qrdx?.status === "password" &&
        result.finalUrl === null && (
          <p className="text-muted-foreground text-sm">{t("passwordHidden")}</p>
        )}

      {result?.finalUrl && result.finalUrl !== result.url && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("endsUpAt")}
          </p>
          <Address url={result.finalUrl} />
        </div>
      )}

      {result && result.findings.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {result.findings.map((finding) => (
            <li
              className="flex gap-2"
              key={`${finding.code}-${finding.message}`}
            >
              {SEVERITY_ICONS[finding.severity]}
              <span className="min-w-0 break-words">{finding.message}</span>
            </li>
          ))}
        </ul>
      )}

      {result && redirects > 0 && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">
            {t(result.complete ? "redirects" : "redirectsIncomplete", {
              count: redirects,
            })}
          </summary>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
            {result.hops.map((hop) => (
              <li className="font-mono text-xs break-all" key={hop.url}>
                {hop.url}
                {hop.status !== null && (
                  <span className="text-muted-foreground"> · {hop.status}</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {result && (
        <p className="text-muted-foreground text-xs">
          {result.webRisk === "clean" || result.webRisk === "threat"
            ? t("checkedWebRisk")
            : result.webRisk === "unavailable"
              ? t("webRiskUnavailable")
              : t("checkedOwn")}{" "}
          {t("noCheckCatchesAll")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <OpenButton
          confirm={openConfirmation(state, t, confirm)}
          disabled={state.phase === "checking"}
          href={url}
          variant={result?.verdict === "danger" ? "destructive" : "default"}
        >
          <ExternalLink className="size-3.5" />
          {openLabel ?? t("open")}
        </OpenButton>
        <CopyButton label={t("copy")} value={url} />
        {state.phase === "error" && (
          <button
            className="text-muted-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            onClick={() => setAttempt((count) => count + 1)}
            type="button"
          >
            <RotateCw className="size-3.5" />
            {t("retry")}
          </button>
        )}
        <Link
          className="text-muted-foreground ml-auto inline-flex items-center gap-1 self-center text-sm underline-offset-4 hover:underline"
          href={reportHref}
        >
          <Flag className="size-3.5" />
          {t("report")}
        </Link>
      </div>
    </div>
  );
}
