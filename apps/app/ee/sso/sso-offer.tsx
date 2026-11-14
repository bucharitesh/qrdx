"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Building } from "iconsax-reactjs";
import { useId, useState } from "react";
import { startSsoSignIn } from "@/ee/sso/start-sso-sign-in";

// min-h-10: a 40 px tap target on phones without looking bigger.
const TEXT_ACTION =
  "inline-flex min-h-10 items-center rounded-sm px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

interface SsoOfferProps {
  /** The address typed in; its domain signs in with SSO. */
  email: string;
  /** Same-site path to land on after sign-in (read when the sign-in starts). */
  callbackURL: () => string;
  lastUsed?: boolean;
  /** The step's one status line, shared with sending a code. */
  error: string | null;
  onError: (message: string | null) => void;
  /** "Email me a code" is in progress. */
  sendingCode: boolean;
  /**
   * "Email me a code"; absent when a code sign-in was just refused because
   * the domain requires SSO.
   */
  onEmailCode?: () => void;
  onBack: () => void;
  /** The domain requires SSO (only the workspace's owners can use a code). */
  required?: boolean;
}

/**
 * The email step's answer when the address's domain signs in with SSO
 * (ee/sso/sign-in-offer.ts): Continue with SSO, or an email code anyway.
 * Where the domain requires SSO, the code is still offered (the workspace's
 * owners keep it) until a code sign-in is refused. The sign-in panel shows
 * the heading.
 */
export function SsoOffer({
  email,
  callbackURL,
  lastUsed = false,
  error,
  onError,
  sendingCode,
  onEmailCode,
  onBack,
  required = false,
}: SsoOfferProps) {
  const id = useId();
  const [starting, setStarting] = useState(false);
  const busy = starting || sendingCode;

  const start = async () => {
    onError(null);
    setStarting(true);
    const failure = await startSsoSignIn(email, callbackURL());
    // Still busy while the browser goes to the identity provider.
    if (failure) {
      onError(failure);
      setStarting(false);
    }
  };

  const statusId = `${id}-status`;
  return (
    <div className="flex flex-col items-center gap-4 px-6 pb-6">
      <div className="relative w-full">
        <Button
          aria-describedby={statusId}
          autoFocus
          className="h-10 w-full sm:h-9"
          disabled={busy}
          onClick={() => void start()}
          type="button"
          variant="outline"
        >
          <Building aria-hidden className="size-5" />
          <span className="font-medium">Continue with SSO</span>
          {starting && <ModuleOrbit aria-hidden className="size-4" />}
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

      <p
        aria-live="polite"
        className="min-h-5 text-center text-xs text-pretty text-muted-foreground data-[error=true]:text-destructive"
        data-error={Boolean(error)}
        id={statusId}
        role={error ? "alert" : undefined}
      >
        {error ??
          (required
            ? "Your company requires it for this address. You'll continue on its sign-in page."
            : "You'll continue on your company's sign-in page.")}
      </p>

      {/* The 40 px tap targets keep the code step's spacing and edges. */}
      <div className="-mx-1 -my-3 flex items-center justify-between gap-4 self-stretch">
        <button
          className={TEXT_ACTION}
          disabled={busy}
          onClick={onBack}
          type="button"
        >
          Use a different email
        </button>
        {onEmailCode && (
          <button
            className={TEXT_ACTION}
            disabled={busy}
            onClick={onEmailCode}
            type="button"
          >
            {sendingCode ? "Sending…" : "Email me a code"}
          </button>
        )}
      </div>
    </div>
  );
}
