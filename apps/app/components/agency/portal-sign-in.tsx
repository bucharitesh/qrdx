"use client";

// The client portal's sign-in (agency tools): the app's email-code sign-in,
// under the portal's branding. Signing in for the first time also makes the
// person a free QRdx account of their own; the portal never shows it.

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { Logout } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmailCodeSignIn } from "@/app/(app)/(auth)/components/email-code-sign-in";

export function PortalSignIn() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  // The form brings its own side padding (the sign-in panel's); the card
  // around it here already has some.
  return (
    <div className="-mx-6">
      <EmailCodeSignIn
        onSentToChange={setSentTo}
        onSignedIn={() => router.refresh()}
        sentTo={sentTo}
      />
    </div>
  );
}

export function PortalSignOut({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut().catch(() => {});
        router.refresh();
        setBusy(false);
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Logout aria-hidden />
      {label}
    </Button>
  );
}
