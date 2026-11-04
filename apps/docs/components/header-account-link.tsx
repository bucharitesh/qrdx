"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { DEFAULT_NEXT_PATH } from "@/lib/safe-redirect";

/** One grid cell for both labels; the hidden one still holds its width. */
const LABEL = "col-start-1 row-start-1";

/**
 * The bar's one call to action: "Try the Playground" for visitors,
 * "Dashboard" once signed in. Both labels are always laid out in the same
 * cell, so the button is one width in every state and the bar doesn't move
 * when the session arrives after the first paint.
 */
export function HeaderAccountLink({
  className,
  compact = false,
  onNavigate,
}: {
  className?: string;
  /** Shortens the visitor label on phones, where the bar is narrow. */
  compact?: boolean;
  /** Called before leaving (e.g. to close a drawer). */
  onNavigate?: () => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  return (
    <Button
      asChild
      // Keeps its place while the session loads.
      className={cn(isPending && "invisible", className)}
    >
      <Link
        aria-hidden={isPending || undefined}
        href={signedIn ? DEFAULT_NEXT_PATH : "/playground"}
        onClick={onNavigate}
        tabIndex={isPending ? -1 : undefined}
      >
        <span className="grid justify-items-center">
          <span className={cn(LABEL, signedIn && "invisible")}>
            {compact ? (
              <>
                <span className="sm:hidden">Playground</span>
                <span className="hidden sm:inline">Try the Playground</span>
              </>
            ) : (
              "Try the Playground"
            )}
          </span>
          <span className={cn(LABEL, !signedIn && "invisible")}>Dashboard</span>
        </span>
      </Link>
    </Button>
  );
}
