"use client";

import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { Lock } from "iconsax-reactjs";
import { useEffect, useRef, useState } from "react";
import { checkQrCodeSlug } from "@/actions/qr-codes";
import {
  CUSTOM_SLUG_MAX,
  SLUG_PROBLEM_MESSAGES,
  slugProblem,
} from "@/lib/short-links";

/** Where the typed back-half stands; "idle" = nothing to check. */
export type SlugStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "blocked"; message: string }
  | { state: "unknown"; message: string };

const DEBOUNCE_MS = 400;

/**
 * Checks a back-half as the user types: the rules in the browser right away,
 * availability on the server after a pause (and only for the latest value).
 */
export function useSlugCheck({
  slug,
  domainId,
  codeId,
  unchanged,
  enabled,
}: {
  slug: string;
  domainId: string | null;
  codeId?: string;
  /** The code's own back-half on its own domain: nothing to check */
  unchanged: boolean;
  enabled: boolean;
}): SlugStatus {
  const [status, setStatus] = useState<SlugStatus>({ state: "idle" });
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current;
    const value = slug.trim();
    if (!(enabled && value) || unchanged) {
      setStatus({ state: "idle" });
      return;
    }
    const problem = slugProblem(value, { onCustomDomain: Boolean(domainId) });
    if (problem) {
      setStatus({ state: "blocked", message: SLUG_PROBLEM_MESSAGES[problem] });
      return;
    }
    setStatus({ state: "checking" });
    const timer = setTimeout(() => {
      checkQrCodeSlug({ slug: value, domainId, codeId })
        .then((result) => {
          if (request !== latest.current) return;
          if (!result.success) {
            setStatus({
              state: "unknown",
              message:
                result.error.code === "RATE_LIMITED"
                  ? "Too many checks for now. It's checked again when you save."
                  : "Couldn't check right now. It's checked again when you save.",
            });
            return;
          }
          const { status: state, message } = result.data;
          setStatus(
            state === "available"
              ? { state: "available" }
              : { state: "blocked", message },
          );
        })
        .catch(() => {
          if (request === latest.current) {
            setStatus({
              state: "unknown",
              message:
                "Couldn't check right now. It's checked again when you save.",
            });
          }
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [slug, domainId, codeId, unchanged, enabled]);

  return status;
}

/** "Custom back-half" input with the link prefix and the live check. */
export function SlugField({
  value,
  onChange,
  prefix,
  status,
  allowed,
  editing,
  disabled,
  onUpgrade,
}: {
  value: string;
  onChange: (value: string) => void;
  /** e.g. "qrdx.dev/q/" or "go.brand.com/" */
  prefix: string;
  status: SlugStatus;
  /** The plan includes custom back-halves */
  allowed: boolean;
  /** Editing an existing code (its link changes with the back-half) */
  editing: boolean;
  disabled?: boolean;
  onUpgrade: () => void;
}) {
  const describedBy = "code-slug-status";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="code-slug">
          Custom back-half{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        {!allowed && (
          <button
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors"
            onClick={onUpgrade}
            type="button"
          >
            <Lock aria-hidden className="size-3" />
            Pro
          </button>
        )}
      </div>
      <div
        className={cn(
          "border-input focus-within:ring-ring/50 focus-within:border-ring flex h-9 items-center overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] dark:bg-input/30",
          status.state === "blocked" && "border-destructive/60",
          (disabled || !allowed) && "opacity-60",
        )}
      >
        <span
          className="text-muted-foreground max-w-[55%] shrink-0 truncate border-r bg-muted/40 px-2.5 text-sm leading-9 select-none"
          title={prefix}
        >
          {prefix}
        </span>
        <Input
          aria-describedby={describedBy}
          aria-invalid={status.state === "blocked" || undefined}
          autoCapitalize="none"
          autoComplete="off"
          className="h-full min-w-0 flex-1 rounded-none border-0 pl-2 shadow-none focus-visible:ring-0 disabled:opacity-100 dark:bg-transparent"
          disabled={disabled || !allowed}
          id="code-slug"
          maxLength={CUSTOM_SLUG_MAX}
          onChange={(event) => onChange(event.target.value)}
          placeholder={allowed ? "spring-menu" : "Generated for you"}
          spellCheck={false}
          value={value}
        />
        <span aria-hidden className="flex w-8 shrink-0 justify-center">
          {status.state === "checking" && (
            <Spinner className="text-muted-foreground size-4 animate-spin" />
          )}
          {status.state === "available" && (
            <Tick className="text-foreground size-4" strokeWidth={2} />
          )}
        </span>
      </div>
      <p
        aria-live="polite"
        className={cn(
          "text-xs",
          status.state === "blocked"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
        id={describedBy}
      >
        {!allowed
          ? "Choose your own link, like qrdx.dev/q/spring-menu, on Pro and Business."
          : status.state === "blocked" || status.state === "unknown"
            ? status.message
            : status.state === "available"
              ? editing
                ? "Available. QR codes printed with the old link stop working."
                : "Available."
              : status.state === "checking"
                ? "Checking…"
                : editing
                  ? "Letters, digits, - and _. Changing it changes the link."
                  : "Letters, digits, - and _. Leave empty for a generated link."}
      </p>
    </div>
  );
}
