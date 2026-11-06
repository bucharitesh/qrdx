"use client";

import { authClient } from "@repo/auth/client";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { FingerScan } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { signInFailureMessage } from "@/lib/account/passkeys";
import { browserHasPasskeys, passkeysWorkOn } from "@/lib/passkeys";

interface PasskeySignInProps {
  /** Same-site path to open after signing in; otherwise stay on the page */
  redirectTo?: string;
  onSignedIn: () => void;
  /** Another sign-in method is in progress */
  disabled?: boolean;
  lastUsed?: boolean;
}

/**
 * "Continue with passkey": signs in fully, since a passkey that checks your
 * PIN, fingerprint or face counts as both steps. Only on a click; passkeys
 * aren't offered in the email field's suggestions. Renders nothing where
 * passkeys can't work: not offered on this deployment, a page on another
 * origin (a preview deployment's URL), or a browser without WebAuthn.
 */
export function PasskeySignIn({
  redirectTo,
  onSignedIn,
  disabled = false,
  lastUsed = false,
}: PasskeySignInProps) {
  const router = useRouter();
  const offered = useAvailability().has("passkeys");
  const [usable, setUsable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsable(
      offered && browserHasPasskeys() && passkeysWorkOn(window.location.origin),
    );
  }, [offered]);

  if (!usable) return null;

  const signIn = async () => {
    // Captured now: closing the dialog clears the caller's callback URL.
    const target = redirectTo;
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        // Nothing when the prompt was just closed.
        setError(signInFailureMessage(result.error));
        return;
      }
      // The session updates in place; server-rendered parts need a refresh.
      if (target) router.push(target);
      else router.refresh();
      onSignedIn();
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
          <span className="font-medium">Continue with passkey</span>
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
