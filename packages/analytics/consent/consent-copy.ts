import type { ComponentType, ReactNode } from "react";

// Labels and copy: the app's messages/<locale>.json (consent). The privacy
// policy is English only (legal pages aren't translated).
export const PRIVACY_POLICY_URL = "/legal/privacy-policy";

export const TEXT_LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

/**
 * The app's link for the privacy policy links (the main app's keeps the
 * visitor's language: apps/docs/components/i18n/locale-link.tsx).
 */
export type ConsentLink = ComponentType<{
  href: string;
  className?: string;
  prefetch?: boolean;
  children?: ReactNode;
}>;
