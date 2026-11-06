"use client";

import { authClient } from "@repo/auth/client";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { FingerScan } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { signInFailureMessage } from "@/lib/account/passkeys";
import { browserHasPasskeys, passkeysWorkOn } from "@/lib/passkeys";

type SignInResult = Awaited<ReturnType<typeof authClient.signIn.passkey>>;

interface PasskeySignInProps {
  /** Same-site path to open after signing in; otherwise stay on the page */
  redirectTo?: string;
  onSignedIn: () => void;
  /** Another sign-in method is in progress */
  disabled?: boolean;
  lastUsed?: boolean;
  /** The panel is open (offers saved passkeys in the email field's autofill) */
  shown?: boolean;
}

/**
 * "Sign in with a passkey", plus passkeys in the email field's autofill
 * (conditional UI, where the browser supports it; the field has
 * autocomplete="email webauthn"). Renders nothing where passkeys can't work:
 * not offered on this deployment, a page on another origin (a preview URL),
 * or a browser without WebAuthn.
 */
export function PasskeySignIn({
  redirectTo,
  onSignedIn,
  disabled = false,
  lastUsed = false,
  shown = true,
}: PasskeySignInProps) {
  const router = useRouter();
  const offered = useAvailability().has("passkeys");
  const [usable, setUsable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read inside async callbacks, after the props may have changed.
  const latest = useRef({ redirectTo, onSignedIn });
  latest.current = { redirectTo, onSignedIn };

  useEffect(() => {
    setUsable(
      offered && browserHasPasskeys() && passkeysWorkOn(window.location.origin),
    );
  }, [offered]);

  /** Signed in: go on. Otherwise show why (or nothing, if cancelled). */
  const finish = useCallback(
    (result: SignInResult, target: string | undefined) => {
      if (result.error) {
        setError(signInFailureMessage(result.error));
        return;
      }
      // The session updates in place; server-rendered parts need a refresh.
      if (target) router.push(target);
      else router.refresh();
      latest.current.onSignedIn();
    },
    [router],
  );

  // Saved passkeys in the email field's suggestions. The browser keeps the
  // request open until one is picked; starting another passkey request
  // (the button, or reopening the panel) cancels it.
  useEffect(() => {
    if (!(usable && shown)) return;
    let active = true;
    void (async () => {
      const available =
        await window.PublicKeyCredential.isConditionalMediationAvailable?.().catch(
          () => false,
        );
      if (!(available && active)) return;
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (active) finish(result, latest.current.redirectTo);
    })();
    return () => {
      active = false;
    };
  }, [usable, shown, finish]);

  if (!usable) return null;

  const signIn = async () => {
    // Captured now: closing the dialog clears the caller's callback URL.
    const target = redirectTo;
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.signIn.passkey();
      finish(result, target);
    } catch (err) {
      console.error("Passkey sign-in failed:", err);
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-2 px-6 pt-2">
      <div className="relative">
        <Button
          className="h-10 w-full sm:h-9"
          disabled={disabled || loading}
          onClick={signIn}
          variant="outline"
        >
          <FingerScan className="size-5" />
          <span className="font-medium">Sign in with a passkey</span>
          {loading && <Spinner className="size-4 animate-spin" />}
        </Button>
        {lastUsed && (
          <Badge
            className="pointer-events-none absolute -top-2 right-3 px-1.5 py-0 text-[10px]"
            variant="secondary"
          >
            Last used
          </Badge>
        )}
      </div>
      {error && (
        <p className="text-xs text-pretty text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
