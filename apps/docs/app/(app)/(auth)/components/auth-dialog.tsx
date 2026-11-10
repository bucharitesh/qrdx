"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { usePathname, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignInPanel } from "./sign-in-panel";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "signin" | "signup";
  trigger?: React.ReactNode; // Optional trigger element
  /** Same-site path to land on after sign-in (defaults to the current page) */
  callbackURL?: string;
}

/** Sign-in over the current page. The /sign-in page renders the same panel. */
export function AuthDialog({
  open,
  onOpenChange,
  initialMode = "signin",
  trigger,
  callbackURL,
}: AuthDialogProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Only a path on this site, never another origin (lib/safe-redirect).
  const redirectTo = safeNextPath(callbackURL, "") || undefined;

  const getCallbackUrl = () => {
    if (redirectTo) return redirectTo;
    const baseUrl = pathname || "/playground";
    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
        <SignInPanel
          callbackURL={getCallbackUrl}
          Description={DialogDescription}
          mode={initialMode}
          onSignedIn={() => onOpenChange(false)}
          redirectTo={redirectTo}
          shown={open}
          Title={DialogTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
