import type { HeadlessConsentSurfaceAction } from "@c15t/nextjs/headless";

export const PRIVACY_POLICY_URL = "/legal/privacy-policy";

export const ACTION_LABELS: Record<HeadlessConsentSurfaceAction, string> = {
  accept: "Accept all",
  reject: "Reject all",
  customize: "Customise",
  save: "Save choices",
  dismiss: "OK",
};

export const TEXT_LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";
