"use client";

import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";
import { AuthDialog } from "@/app/(auth)/components/auth-dialog";
import { authClient } from "@/lib/auth-client";
import { executePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useAuthStore } from "@/store/auth-store";

export function AuthDialogWrapper() {
  const {
    isOpen,
    mode,
    closeAuthDialog,
    postLoginAction,
    clearPostLoginAction,
  } = useAuthStore();
  const { data: session } = authClient.useSession();
  const posthog = usePostHog();

  useEffect(() => {
    if (isOpen && session) {
      closeAuthDialog();
    }

    if (session?.user?.email) {
      // Identify user with PostHog
      posthog.identify(session.user.email, {
        name: session.user.name,
        email: session.user.email,
      });
    }

    if (session && postLoginAction) {
      // Execute action immediately - the system will now handle waiting for handlers
      executePostLoginAction(postLoginAction);
      clearPostLoginAction();
    }
  }, [
    session,
    isOpen,
    closeAuthDialog,
    postLoginAction,
    clearPostLoginAction,
    posthog,
  ]);

  return (
    <AuthDialog
      open={isOpen}
      onOpenChange={closeAuthDialog}
      initialMode={mode}
    />
  );
}
