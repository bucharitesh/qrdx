"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Diamonds as Gem } from "iconsax-reactjs";
import type { ComponentProps } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

export function UpgradeButton({
  children = "Upgrade to Pro",
  ...props
}: ComponentProps<typeof Button>) {
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  return (
    <Button onClick={openGetProDialog} {...props}>
      <Gem className="size-4" />
      {children}
    </Button>
  );
}

export function SignInButton({
  children = "Sign in",
  ...props
}: ComponentProps<typeof Button>) {
  const openAuthDialog = useAuthStore((s) => s.openAuthDialog);
  return (
    <Button onClick={() => openAuthDialog("signin")} {...props}>
      {children}
    </Button>
  );
}
