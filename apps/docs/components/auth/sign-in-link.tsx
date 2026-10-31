"use client";

import { authClient } from "@repo/auth/client";
import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { useAuthStore } from "@/store/auth-store";

/**
 * Click handler for links into signed-in pages (the dashboard, settings).
 * Signed-out visitors get the sign-in dialog and land on `href` afterwards,
 * instead of being bounced to the playground by the proxy. While the session
 * is still loading, the link just navigates.
 */
export function useSignInGate<E extends HTMLElement>(
  href: string,
  onClick?: (event: MouseEvent<E>) => void,
) {
  const { data: session, isPending } = authClient.useSession();
  const openSignInTo = useAuthStore((state) => state.openSignInTo);

  return (event: MouseEvent<E>) => {
    onClick?.(event);
    if (event.defaultPrevented || isPending || session?.user) return;
    // Let modified clicks (new tab, etc.) behave like normal links.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    openSignInTo(href);
  };
}

type SignInLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

/** A next/link that asks signed-out visitors to sign in first. */
export function SignInLink({ href, onClick, ...props }: SignInLinkProps) {
  const handleClick = useSignInGate(href, onClick);
  return <Link href={href} onClick={handleClick} {...props} />;
}
