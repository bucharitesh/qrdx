"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { twoFactorSetupHref } from "@/lib/workspace-two-factor";

/**
 * "Turn on two-step verification": Settings → Profile & security, which
 * offers the way back to this page once it's on.
 */
export function TurnOnTwoFactorLink() {
  const t = useTranslations("app.workspaces.twoFactorRequiredLink");
  const pathname = usePathname();
  return (
    <Button asChild className="w-full">
      <Link href={twoFactorSetupHref(pathname)}>
        {t("turnOnTwoStepVerification")}
      </Link>
    </Button>
  );
}
