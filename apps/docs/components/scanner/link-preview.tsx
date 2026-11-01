"use client";

import {
  Info,
  Spinner as LoaderCircle,
} from "@repo/design-system/components/icons";
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
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
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
  | { phase: "error"; message: string };

const VERDICTS: Record<
  LinkVerdict,
  { title: string; body: string; icon: typeof ShieldCheck; tone: string }
> = {
  verified: {
    title: "Verified QRdx code",
    body: "A real, active QR code made with QRdx, with no open abuse reports. Its owner chose where it goes.",
    icon: ShieldCheck,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  },
  ok: {
    title: "No warnings found",
    body: "Nothing we check for turned up. Still look at the address before you sign in or pay.",
    icon: ShieldCheck,
    tone: "border-border bg-muted/40",
  },
  caution: {
    title: "Be careful",
    body: "Some things about this link deserve a second look before you open it.",
    icon: TriangleAlert,
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  },
  danger: {
    title: "Don't open this link",
    body: "This link shows strong signs of phishing, malware or a disguised address.",
    icon: ShieldAlert,
    tone: "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100",
  },
  unknown: {
    title: "Couldn't check this link",
    body: "Check the address carefully before you open it.",
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
  extra?: OpenConfirmation | null,
): OpenConfirmation | null {
  if (state.phase === "done" && state.result.verdict === "danger") {
    return {
      title: "Open a dangerous link?",
      description: (
        <p>
          This link was flagged as dangerous. Only continue if you know exactly
          where it goes, and never enter passwords or payment details there.
        </p>
      ),
      action: "Open anyway",
    };
  }
  if (state.phase === "error") {
    return {
      title: "Open without a safety check?",
      description: (
        <p>We couldn't check this link. Read the address carefully first.</p>
      ),
      action: "Open link",
    };
  }
  return extra ?? null;
}

export function LinkPreview({
  url,
  confirm,
  openLabel = "Open link",
}: {
  url: string;
  /** Extra confirmation before opening (payment links). */
  confirm?: OpenConfirmation;
  openLabel?: string;
}) {
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
            error instanceof Error && navigator.onLine
              ? error.message
              : "You seem to be offline, so the link couldn't be checked.",
        });
      });
    return () => controller.abort();
  }, [url, attempt]);

  const verdict =
    state.phase === "done"
      ? VERDICTS[state.result.verdict]
      : state.phase === "error"
        ? VERDICTS.unknown
        : null;
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
          <LoaderCircle
            aria-hidden
            className="mt-0.5 size-5 shrink-0 animate-spin"
          />
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {verdict ? verdict.title : "Checking where this link goes…"}
          </p>
          <p className="opacity-80">
            {state.phase === "error"
              ? `${state.message} ${VERDICTS.unknown.body}`
              : verdict
                ? verdict.body
                : "Following redirects and checking the address. Nothing opens until you choose."}
          </p>
        </div>
      </div>

      {result &&
        result.qrdx?.status === "password" &&
        result.finalUrl === null && (
          <p className="text-muted-foreground text-sm">
            The destination is hidden until you enter the code's password.
          </p>
        )}

      {result?.finalUrl && result.finalUrl !== result.url && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Ends up at
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
            {redirects === 1 ? "1 redirect" : `${redirects} redirects`}
            {result.complete ? "" : " (not followed to the end)"}
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
            ? "Checked with Google Web Risk and QRdx's own checks."
            : result.webRisk === "unavailable"
              ? "Google Web Risk couldn't be reached; QRdx's own checks ran."
              : "Checked with QRdx's own checks."}{" "}
          No check catches everything.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <OpenButton
          confirm={openConfirmation(state, confirm)}
          disabled={state.phase === "checking"}
          href={url}
          variant={result?.verdict === "danger" ? "destructive" : "default"}
        >
          <ExternalLink className="size-3.5" />
          {openLabel}
        </OpenButton>
        <CopyButton label="Copy link" value={url} />
        {state.phase === "error" && (
          <button
            className="text-muted-foreground inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            onClick={() => setAttempt((count) => count + 1)}
            type="button"
          >
            <RotateCw className="size-3.5" />
            Try again
          </button>
        )}
        <Link
          className="text-muted-foreground ml-auto inline-flex items-center gap-1 self-center text-sm underline-offset-4 hover:underline"
          href={reportHref}
        >
          <Flag className="size-3.5" />
          Report this code
        </Link>
      </div>
    </div>
  );
}
