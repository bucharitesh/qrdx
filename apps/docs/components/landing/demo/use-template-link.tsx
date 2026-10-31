"use client";

import { authClient } from "@repo/auth/client";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  type MouseEvent,
  Suspense,
  useState,
} from "react";
import { AuthDialog } from "@/app/(auth)/components/auth-dialog";
import { templateStartPath } from "@/lib/landing/demo-paths";

/**
 * "Use this template": the dashboard's New page dialog with this template
 * preselected. Signed-out visitors get the sign-in dialog first and land on
 * the same dashboard URL after signing in.
 */
export function UseTemplateLink({
  type,
  variantId,
  onClick,
  ...props
}: {
  type: string;
  variantId: string;
} & Omit<ComponentProps<"a">, "href">) {
  const router = useRouter();
  const href = templateStartPath(type, variantId);
  const [checking, setChecking] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // Stays mounted after the first open so the dialog can animate out.
  const [authMounted, setAuthMounted] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // New tab or window: let the browser follow the link.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    const session = await authClient.getSession().then(
      (result) => result.data,
      () => null,
    );
    setChecking(false);
    if (session) {
      router.push(href);
      return;
    }
    setAuthMounted(true);
    setAuthOpen(true);
  };

  return (
    <>
      <a
        aria-busy={checking || undefined}
        href={href}
        onClick={handleClick}
        rel="nofollow"
        {...props}
      />
      {authMounted && (
        <Suspense fallback={null}>
          <AuthDialog
            callbackURL={href}
            initialMode="signup"
            onOpenChange={setAuthOpen}
            open={authOpen}
          />
        </Suspense>
      )}
    </>
  );
}
