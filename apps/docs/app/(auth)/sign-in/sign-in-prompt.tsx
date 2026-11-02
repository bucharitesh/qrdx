"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useEffect } from "react";
import { useAuthStore } from "@/store/auth-store";

/**
 * Opens the sign-in dialog on arrival, landing on `next` (already checked by
 * lib/safe-redirect) afterwards. Closing the dialog leaves a way back in.
 */
export function SignInPrompt({ next }: { next: string }) {
  const openSignInTo = useAuthStore((state) => state.openSignInTo);
  const path = next.split(/[?#]/)[0];

  useEffect(() => {
    openSignInTo(next);
  }, [next, openSignInTo]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            Sign in to continue
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">
            <span className="break-all font-mono text-foreground">{path}</span>{" "}
            needs a QRdx account. Sign in and you'll go straight there. Any
            sign-in option creates a free account.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={() => openSignInTo(next)}>
            Sign in
          </Button>
          <Button asChild className="w-full" variant="ghost">
            <Link href="/">Back to QRdx</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
