"use client";

import { authClient } from "@repo/auth/client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { executePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useAuthStore } from "@/store/auth-store";

// The dialog (sign-in UI, icon set, logo animation) loads the first time it
// opens, so it stays out of every page's first load.
const AuthDialog = dynamic(
  () => import("@/app/(auth)/components/auth-dialog").then((m) => m.AuthDialog),
  { ssr: false },
);

export function AuthDialogWrapper() {
  const {
    isOpen,
    mode,
    closeAuthDialog,
    postLoginAction,
    clearPostLoginAction,
    callbackURL,
  } = useAuthStore();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (isOpen && session) {
      closeAuthDialog();
    }

    // Analytics identity (by user id, never email): lib/analytics/identity.ts.

    if (session && postLoginAction) {
      // Execute action immediately - the system will now handle waiting for handlers
      executePostLoginAction(postLoginAction);
      clearPostLoginAction();
    }
  }, [session, isOpen, closeAuthDialog, postLoginAction, clearPostLoginAction]);

  // Once opened, keep it mounted so closing still animates.
  const [hasOpened, setHasOpened] = useState(isOpen);
  if (isOpen && !hasOpened) setHasOpened(true);
  if (!hasOpened) return null;

  return (
    <AuthDialog
      callbackURL={callbackURL ?? undefined}
      open={isOpen}
      onOpenChange={closeAuthDialog}
      initialMode={mode}
    />
  );
}
