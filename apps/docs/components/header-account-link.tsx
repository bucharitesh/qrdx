"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import type { MouseEvent } from "react";
import { DEFAULT_NEXT_PATH, SIGN_IN_PATH } from "@/lib/safe-redirect";
import { useAuthStore } from "@/store/auth-store";

/** A plain left click; modified clicks (new tab, …) follow the href. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * "Sign in" for visitors, "Dashboard" once signed in. Sign in opens the
 * dialog in place and lands on the dashboard; without JavaScript (or in a new
 * tab) the link goes to /sign-in, which does the same.
 */
export function HeaderAccountLink({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called before leaving or opening the dialog (e.g. to close a drawer). */
  onNavigate?: () => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const openSignInTo = useAuthStore((state) => state.openSignInTo);

  if (session?.user) {
    return (
      <Button asChild className={className} variant="outline">
        <Link href={DEFAULT_NEXT_PATH} onClick={onNavigate}>
          Dashboard
        </Link>
      </Button>
    );
  }

  return (
    <Button
      asChild
      // Keeps its place while the session loads, so the bar doesn't shift.
      className={cn(isPending && "invisible", className)}
      variant="outline"
    >
      <Link
        aria-hidden={isPending || undefined}
        href={SIGN_IN_PATH}
        onClick={(event) => {
          onNavigate?.();
          if (!isPlainClick(event)) return;
          event.preventDefault();
          openSignInTo(DEFAULT_NEXT_PATH);
        }}
        tabIndex={isPending ? -1 : undefined}
      >
        Sign in
      </Link>
    </Button>
  );
}
