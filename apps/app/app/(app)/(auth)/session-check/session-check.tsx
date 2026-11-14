"use client";

import { authClient } from "@repo/auth/client";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConfirmIdentityProvider,
  useConfirmation,
} from "@/components/confirm-identity/provider";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { SESSION_CHECK_MESSAGES } from "@/lib/account/session-origin";
import { signInPath } from "@/lib/safe-redirect";
import { checkSession } from "./_lib/actions";

/** The check page: a blank page with "Confirm it's you" over it. */
export function SessionCheck({
  next,
  returning,
}: {
  next: string;
  returning: boolean;
}) {
  return (
    <ConfirmIdentityProvider>
      <SessionCheckScreen next={next} returning={returning} />
    </ConfirmIdentityProvider>
  );
}

type Step = "asking" | "waiting" | "leaving";

function SessionCheckScreen({
  next,
  returning,
}: {
  next: string;
  returning: boolean;
}) {
  const t = useTranslations("app.sessionCheck.sessionCheck");
  const { withConfirmation } = useConfirmation();
  const [step, setStep] = useState<Step>("asking");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const ask = useCallback(async () => {
    setStep("asking");
    setError(null);
    try {
      const result = await withConfirmation(
        () => checkSession(),
        "continue-session",
      );
      // Cancelled: the page stays, with a way back in and a way out.
      if (result === null) {
        setStep("waiting");
        return;
      }
      if (result.ok) {
        setStep("leaving");
        // A full load, so every server-rendered part sees the session.
        window.location.assign(next);
        return;
      }
      setError(result.error);
      setStep("waiting");
    } catch {
      setError(SESSION_CHECK_MESSAGES.failed);
      setStep("waiting");
    }
  }, [withConfirmation, next]);

  // The dialog opens on its own, once. Back from signing in again, the
  // provider finishes that first and the page loads again without it.
  useEffect(() => {
    if (returning || started.current) return;
    started.current = true;
    void ask();
  }, [ask, returning]);

  const signOut = async () => {
    setStep("leaving");
    await authClient.signOut().catch(() => {});
    window.location.assign(signInPath(next));
  };

  const busy = step !== "waiting";

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="bg-card w-full max-w-sm overflow-hidden rounded-xl border shadow-sm">
        <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
          <QrdxLogoAnimation className="mb-3" size={52} />
          <h1 className="text-xl font-semibold tracking-tight">
            {SESSION_CHECK_MESSAGES.title}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {SESSION_CHECK_MESSAGES.body}
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6">
          {error && (
            <p
              className="text-destructive pb-1 text-center text-sm text-pretty"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button
            className="w-full max-sm:h-10"
            disabled={busy}
            onClick={() => void ask()}
            type="button"
          >
            {step === "leaving" && <Spinner className="animate-spin" />}
            {t("continue")}
          </Button>
          <Button
            className="w-full max-sm:h-10"
            disabled={busy}
            onClick={() => void signOut()}
            type="button"
            variant="outline"
          >
            {t("signOut")}
          </Button>
        </div>
      </div>
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center rounded-sm px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href="/"
      >
        {t("backToQrdx")}
      </Link>
    </main>
  );
}
