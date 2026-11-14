"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { checkStrongConfirmationAction } from "./actions";

type Status = "checking" | "waiting" | "failed";

/**
 * Opens "Confirm it's you" (the admin layout's provider) straight away, and
 * goes back to `next` once this session has a strong confirmation. A full
 * page load: `next` is a console page, served by the other zone.
 */
export function ConfirmAndReturn({ next }: { next: string }) {
  const { withConfirmation } = useConfirmation();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(() => {
    setStatus("checking");
    setError(null);
    withConfirmation(() => checkStrongConfirmationAction(), "support-change")
      .then((result) => {
        // Cancelled, or confirmed with something that isn't enough here.
        if (result === null) {
          setStatus("waiting");
        } else if (result.ok) {
          window.location.assign(next);
        } else {
          setError(result.error);
          setStatus("failed");
        }
      })
      .catch(() => {
        setError("Something went wrong. Reload the page and try again.");
        setStatus("failed");
      });
  }, [next, withConfirmation]);

  // Once, even when React runs effects twice in development.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    confirm();
  }, [confirm]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={status === "checking"} onClick={confirm} size="sm">
          {status === "checking" ? "Checking…" : "Confirm it's you"}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <a href={next}>Go back</a>
        </Button>
      </div>
    </div>
  );
}
