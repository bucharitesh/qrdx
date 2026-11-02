"use client";

import {
  WORKSPACE_SLUG_MAX,
  workspaceSlugProblem,
} from "@repo/auth/workspace-rules";
import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef, useState } from "react";
import { checkWorkspaceSlug } from "@/actions/organizations";

export type WorkspaceSlugStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "blocked"; message: string }
  | { state: "unknown"; message: string };

const DEBOUNCE_MS = 400;

/**
 * The rules in the browser right away, availability on the server after a
 * pause (only for the latest value). `current` (the workspace's own URL when
 * renaming) needs no check.
 */
export function useWorkspaceSlugCheck(
  slug: string,
  current?: string,
): WorkspaceSlugStatus {
  const [status, setStatus] = useState<WorkspaceSlugStatus>({ state: "idle" });
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current;
    const value = slug.trim();
    if (!value || value === current) {
      setStatus({ state: "idle" });
      return;
    }
    const problem = workspaceSlugProblem(value);
    if (problem) {
      setStatus({ state: "blocked", message: problem });
      return;
    }
    setStatus({ state: "checking" });
    const timer = setTimeout(() => {
      const unknown = {
        state: "unknown" as const,
        message: "Couldn't check right now. It's checked again when you save.",
      };
      checkWorkspaceSlug({ slug: value })
        .then((result) => {
          if (request !== latest.current) return;
          if (!result.ok) {
            setStatus(unknown);
            return;
          }
          setStatus(
            result.data.status === "available"
              ? { state: "available" }
              : { state: "blocked", message: result.data.message },
          );
        })
        .catch(() => {
          if (request === latest.current) setStatus(unknown);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [slug, current]);

  return status;
}

/** "Workspace URL": the /dashboard/ prefix, the slug and its live check. */
export function WorkspaceSlugField({
  id,
  value,
  onChange,
  status,
  hint,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  status: WorkspaceSlugStatus;
  /** Shown while there's nothing to report */
  hint: string;
  disabled?: boolean;
}) {
  const describedBy = `${id}-status`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Workspace URL</Label>
      <div
        className={cn(
          "border-input focus-within:ring-ring/50 focus-within:border-ring flex h-9 items-center overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] dark:bg-input/30",
          status.state === "blocked" && "border-destructive/60",
          disabled && "opacity-60",
        )}
      >
        <span className="text-muted-foreground shrink-0 border-r bg-muted/40 px-2.5 text-sm leading-9 select-none">
          /dashboard/
        </span>
        <Input
          aria-describedby={describedBy}
          aria-invalid={status.state === "blocked" || undefined}
          autoCapitalize="none"
          autoComplete="off"
          className="h-full min-w-0 flex-1 rounded-none border-0 pl-2 shadow-none focus-visible:ring-0 disabled:opacity-100 dark:bg-transparent"
          disabled={disabled}
          id={id}
          maxLength={WORKSPACE_SLUG_MAX}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          required
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
        {status.state === "blocked" || status.state === "unknown"
          ? status.message
          : status.state === "available"
            ? "Available."
            : status.state === "checking"
              ? "Checking…"
              : hint}
      </p>
    </div>
  );
}
