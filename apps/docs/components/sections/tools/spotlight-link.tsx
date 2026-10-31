"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { SpotlightCard } from "@/components/fx";

/**
 * A next/link card with the FX cursor spotlight. Lives in a client module so
 * server pages can render it (they can't pass `Link` itself as a prop).
 */
export function SpotlightLink(props: Omit<ComponentProps<typeof Link>, "as">) {
  return <SpotlightCard as={Link} {...props} />;
}
