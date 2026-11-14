"use client";

import { resetAnalytics, track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { QrdxLogo } from "@repo/design-system/components/brand/qrdx-logo";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNED_OUT_PATH, takeSignOutIntent } from "./_lib/intent";

type Step = "starting" | "confirm" | "signing-out" | "failed";

/**
 * A calm full-screen step between the app and /sign-in. Opened from the
 * account menu it signs out straight away; opened any other way it asks
 * first. Failures say so and offer a retry; nothing pretends to succeed.
 */
export function SignOutScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("starting");
  const started = useRef(false);

  const signOut = useCallback(async () => {
    setStep("signing-out");
    try {
      // Better Auth sends a POST and clears the session cookie.
      const { error } = await authClient.signOut();
      if (error) throw error;
      track("sign_out");
      resetAnalytics();
      router.replace(SIGNED_OUT_PATH);
    } catch (error) {
      console.error("Sign-out failed:", error);
      setStep("failed");
    }
  }, [router]);

  useEffect(() => {
    // Once, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    if (takeSignOutIntent()) {
      void signOut();
      return;
    }
    void authClient
      .getSession()
      .then(({ data }) => {
        if (data?.user) setStep("confirm");
        else router.replace(SIGNED_OUT_PATH);
      })
      .catch((error) => {
        console.error("Session check failed:", error);
        setStep("confirm");
      });
  }, [router, signOut]);

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <QrdxLogo className="fill-foreground size-8" />

      {(step === "starting" || step === "signing-out") && (
        <div
          aria-live="polite"
          className="text-muted-foreground flex items-center gap-2.5 text-sm"
          role="status"
        >
          <Spinner aria-hidden className="size-4 animate-spin" />
          {step === "signing-out" ? "Signing you out…" : "One moment…"}
        </div>
      )}

      {step === "confirm" && (
        <div className="flex max-w-xs flex-col items-center gap-4">
          <h1 className="text-lg font-semibold">Sign out of QRdx?</h1>
          <div className="flex gap-2">
            <Button autoFocus onClick={() => void signOut()}>
              Sign out
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          </div>
        </div>
      )}

      {step === "failed" && (
        <div className="flex max-w-xs flex-col items-center gap-4" role="alert">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">You're still signed in</h1>
            <p className="text-muted-foreground text-sm text-pretty">
              Signing out didn't work. Check your connection and try again.
            </p>
          </div>
          <div className="flex gap-2">
            <Button autoFocus onClick={() => void signOut()}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
