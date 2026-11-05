"use client";

import { authClient } from "@repo/auth/client";
import { Spinner } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { type FormEvent, useId, useState } from "react";
import { signInPath } from "@/lib/safe-redirect";
import { ssoSignInErrorMessage } from "@/lib/sso/messages";

const TEXT_ACTION =
  "rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

interface SsoSignInProps {
  /** Same-site path to land on after sign-in (read when the sign-in starts). */
  callbackURL: () => string;
  /** Another sign-in method is in progress */
  disabled?: boolean;
  lastUsed?: boolean;
}

/**
 * "Sign in with SSO": a work email finds the company's identity provider
 * (packages/auth/sso.ts), then the browser goes there. Failures on the way
 * back land on /sign-in with ?error= (lib/sso/messages.ts).
 */
export function SsoSignIn({
  callbackURL,
  disabled = false,
  lastUsed = false,
}: SsoSignInProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const next = callbackURL();
    try {
      const { data, error: failure } = await authClient.signIn.sso({
        email: email.trim(),
        callbackURL: next,
        errorCallbackURL: signInPath(next),
      });
      if (failure) {
        setError(
          failure.status === 429
            ? "Too many tries. Wait a minute, then try again."
            : ssoSignInErrorMessage(failure.code, failure.message),
        );
        setBusy(false);
        return;
      }
      if (data?.url) window.location.href = data.url;
    } catch {
      setError(ssoSignInErrorMessage(null));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-center gap-2 px-6 pt-3">
        <button
          className={TEXT_ACTION}
          disabled={disabled}
          onClick={() => setOpen(true)}
          type="button"
        >
          Sign in with SSO
        </button>
        {lastUsed && (
          <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
            Last used
          </Badge>
        )}
      </div>
    );
  }

  return (
    <form className="space-y-2 px-6 pt-4" onSubmit={submit}>
      <Label htmlFor={`${id}-email`}>Work email</Label>
      <div className="flex gap-2">
        <Input
          aria-describedby={`${id}-error`}
          aria-invalid={Boolean(error)}
          autoComplete="email"
          autoFocus
          disabled={busy}
          id={`${id}-email`}
          inputMode="email"
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
        <Button disabled={busy || disabled || !email.trim()} type="submit">
          {busy && <Spinner className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
      <p
        aria-live="polite"
        className="text-destructive text-sm text-pretty empty:hidden"
        id={`${id}-error`}
        role={error ? "alert" : undefined}
      >
        {error}
      </p>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          If your company set it up for QRdx.
        </span>
        <button
          className={TEXT_ACTION}
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
