"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useSignInGate } from "@/components/auth/sign-in-link";
import { SpotlightCard } from "@/components/fx";

type SpotlightLinkProps = Omit<ComponentProps<typeof Link>, "as"> & {
  /** The target needs an account: signed-out visitors sign in first. */
  requireSignIn?: boolean;
};

/**
 * A next/link card with the FX cursor spotlight. Lives in a client module so
 * server pages can render it (they can't pass `Link` itself as a prop).
 */
export function SpotlightLink({
  requireSignIn,
  onClick,
  ...props
}: SpotlightLinkProps) {
  const gate = useSignInGate(String(props.href), onClick);
  return (
    <SpotlightCard
      as={Link}
      {...props}
      onClick={requireSignIn ? gate : onClick}
    />
  );
}
