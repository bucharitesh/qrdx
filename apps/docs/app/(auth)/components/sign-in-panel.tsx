"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import {
  GithubLogo,
  GoogleLogo,
  Spinner,
} from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import Link from "next/link";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { siteConfig } from "@/config/site";
import { EmailCodeSignIn } from "./email-code-sign-in";

const FOOTER_LINK =
  "rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type TextComponent = ComponentType<{
  className?: string;
  children?: ReactNode;
}>;

export interface SignInPanelProps {
  mode?: "signin" | "signup";
  /**
   * Where Google and GitHub return to, as a same-site path (already checked
   * by lib/safe-redirect). Called when a sign-in starts, so it can read the
   * current page.
   */
  callbackURL: () => string;
  /** A same-site path the email code opens after sign-in; else the page refreshes. */
  redirectTo?: string;
  /** The email code signed the person in (the dialog closes itself). */
  onSignedIn?: () => void;
  /** The heading: DialogTitle in the dialog, an h1 on the page. */
  Title: TextComponent;
  /** The line under it: DialogDescription in the dialog, a p on the page. */
  Description: TextComponent;
  /** A status line above the buttons (e.g. "You're signed out."). */
  notice?: ReactNode;
  /** Re-read the last used method when the panel is shown again. */
  shown?: boolean;
}

/**
 * The sign-in UI itself: Google, GitHub and an email code, with "Last used"
 * and the legal footer. The dialog (auth-dialog.tsx) and the /sign-in page
 * both render it, so the two can't drift apart.
 */
export function SignInPanel({
  mode = "signin",
  callbackURL,
  redirectTo,
  onSignedIn,
  Title,
  Description,
  notice,
  shown = true,
}: SignInPanelProps) {
  const isSignIn = mode === "signin";
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);
  // Address the email code went to (the code step), and a key to start over.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [emailFormKey, setEmailFormKey] = useState(0);
  // The email code was right and two-step verification asks for a code.
  const [twoFactor, setTwoFactor] = useState(false);

  useEffect(() => {
    if (shown) setLastLoginMethod(authClient.getLastUsedLoginMethod());
  }, [shown]);

  const socialSignIn = async (
    provider: "google" | "github",
    label: string,
    setLoading: (loading: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: callbackURL(),
      });
      // e.g. the provider is not configured on this server
      if (error) throw error;
    } catch (error) {
      console.error(`${label} Sign In Error:`, error);
      setLoading(false);
      toast.error(`${label} sign-in is not available right now`);
    }
  };

  const handleEmailSignedIn = () => {
    onSignedIn?.();
    // After the dialog's close animation, so it doesn't flash the email step.
    window.setTimeout(() => {
      setCodeSentTo(null);
      setTwoFactor(false);
      setEmailFormKey((key) => key + 1);
    }, 300);
  };

  const busy = isGoogleLoading || isGithubLoading;
  const providers = [
    {
      id: "google",
      label: "Google",
      icon: GoogleLogo,
      loading: isGoogleLoading,
      onClick: () => socialSignIn("google", "Google", setIsGoogleLoading),
    },
    {
      id: "github",
      label: "GitHub",
      icon: GithubLogo,
      loading: isGithubLoading,
      onClick: () => socialSignIn("github", "GitHub", setIsGithubLoading),
    },
  ];

  return (
    <>
      <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
        <QrdxLogoAnimation size={52} className="mb-3" />
        <Title className="text-xl font-semibold tracking-tight">
          {twoFactor
            ? "Two-step verification"
            : codeSentTo
              ? "Check your email"
              : isSignIn
                ? "Sign in to QRdx"
                : "Create your QRdx account"}
        </Title>
        <Description className="text-muted-foreground text-sm text-pretty">
          {twoFactor ? (
            "Your account asks for a second step when you sign in."
          ) : codeSentTo ? (
            <>
              Code sent to{" "}
              <span className="font-medium break-all text-foreground">
                {codeSentTo}
              </span>
            </>
          ) : isSignIn ? (
            "Pick up where you left off."
          ) : (
            "Free to start, no card needed."
          )}
        </Description>
      </div>

      {notice && !codeSentTo && (
        <p
          className="bg-muted/60 mx-6 mb-4 rounded-md px-3 py-2 text-center text-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      {!codeSentTo && (
        <div className="grid grid-cols-2 gap-2 px-6">
          {providers.map((provider) => (
            <div className="relative" key={provider.id}>
              <Button
                className="w-full"
                disabled={busy}
                onClick={provider.onClick}
                variant="outline"
              >
                <provider.icon className="size-5" />
                <span className="font-medium">{provider.label}</span>
                {provider.loading && (
                  <Spinner className="size-4 animate-spin" />
                )}
              </Button>
              {lastLoginMethod === provider.id && (
                <Badge
                  className="pointer-events-none absolute -top-2 right-3 px-1.5 py-0 text-[10px]"
                  variant="secondary"
                >
                  Last used
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {!codeSentTo && (
        <div className="flex items-center gap-3 px-6 py-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
      )}

      <EmailCodeSignIn
        disabled={busy}
        key={emailFormKey}
        lastUsed={lastLoginMethod === "email-otp"}
        onSentToChange={setCodeSentTo}
        onSignedIn={handleEmailSignedIn}
        onTwoFactorChange={setTwoFactor}
        redirectTo={redirectTo}
        sentTo={codeSentTo}
      />

      {/* Every method creates the account on first use, so there's no separate sign-up step. */}
      {!codeSentTo && (
        <p className="px-6 pt-4 pb-6 text-center text-xs text-pretty text-muted-foreground">
          New to QRdx? Any sign-in option creates your free account.
        </p>
      )}

      <footer className="flex items-center justify-between gap-4 border-t px-6 py-3 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} QRdx</span>
        <nav aria-label="Help and legal" className="flex gap-3">
          <a className={FOOTER_LINK} href={`mailto:${siteConfig.links.email}`}>
            Support
          </a>
          <Link className={FOOTER_LINK} href="/legal/privacy-policy">
            Privacy
          </Link>
          <Link className={FOOTER_LINK} href="/legal/terms-of-service">
            Terms
          </Link>
        </nav>
      </footer>
    </>
  );
}
