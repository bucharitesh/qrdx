"use client";

import { track } from "@repo/analytics";
import { Button } from "@repo/design-system/components/ui/button";
import type { ComponentProps } from "react";
import type { UpgradeAction } from "@/app/(app)/settings/usage/_lib/meters";
import { LocaleLink as Link } from "@/components/i18n/locale-link";

/** An upgrade link from a limit (limitCopy's `upgrade`), tracked on click. */
export function UpgradeButton({
  upgrade,
  source,
  onNavigate,
  ...props
}: {
  upgrade: UpgradeAction;
  /** For analytics, e.g. "limit_dialog" */
  source: string;
  onNavigate?: () => void;
} & Omit<ComponentProps<typeof Button>, "asChild" | "children">) {
  return (
    <Button asChild size="sm" {...props}>
      <Link
        href={upgrade.href}
        onClick={() => {
          track("upgrade_clicked", { source, plan: upgrade.plan });
          onNavigate?.();
        }}
      >
        {upgrade.label}
      </Link>
    </Button>
  );
}
