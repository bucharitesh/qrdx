"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Separator } from "@repo/design-system/components/ui/separator";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { siteConfig } from "@/config/site";
import { EmailCodeSignIn } from "./email-code-sign-in";

const FOOTER_LINK =
  "rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The path when it stays on this site ("//host" and "/\host" leave it). */
function sameSitePath(url: string | undefined): string | undefined {
  return url?.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")
    ? url
    : undefined;
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "signin" | "signup";
  trigger?: React.ReactNode; // Optional trigger element
  /** Same-site path to land on after sign-in (defaults to the current page) */
  callbackURL?: string;
}

export function AuthDialog({
  open,
  onOpenChange,
  initialMode = "signin",
  trigger,
  callbackURL,
}: AuthDialogProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSignIn = initialMode === "signin";
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);
  // Address the email code went to (the code step), and a key to start over.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [emailFormKey, setEmailFormKey] = useState(0);
  const redirectTo = sameSitePath(callbackURL);

  const getCallbackUrl = () => {
    if (redirectTo) return redirectTo;
    const baseUrl = pathname || "/playground";
    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  useEffect(() => {
    if (open) setLastLoginMethod(authClient.getLastUsedLoginMethod());
  }, [open]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: getCallbackUrl(),
      });
      // e.g. the provider is not configured on this server
      if (error) throw error;
    } catch (error) {
      console.error("Google Sign In Error:", error);
      setIsGoogleLoading(false);
      toast.error("Google sign-in is not available right now");
    }
  };

  const handleGithubSignIn = async () => {
    setIsGithubLoading(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: "github",
        callbackURL: getCallbackUrl(),
      });
      if (error) throw error;
    } catch (error) {
      console.error("GitHub Sign In Error:", error);
      setIsGithubLoading(false);
      toast.error("GitHub sign-in is not available right now");
    }
  };

  const handleEmailSignedIn = () => {
    onOpenChange(false);
    // After the close animation, so the dialog doesn't flash the email step.
    window.setTimeout(() => {
      setCodeSentTo(null);
      setEmailFormKey((key) => key + 1);
    }, 300);
  };

  const busy = isGoogleLoading || isGithubLoading;
  const providers = [
    {
      id: "google",
      label: "Google",
      icon: Icons.google,
      loading: isGoogleLoading,
      onClick: handleGoogleSignIn,
    },
    {
      id: "github",
      label: "GitHub",
      icon: Icons.github,
      loading: isGithubLoading,
      onClick: handleGithubSignIn,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
        <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
          <QrdxLogoAnimation size={52} className="mb-3" />
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {codeSentTo
              ? "Check your email"
              : isSignIn
                ? "Sign in to QRdx"
                : "Create your QRdx account"}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {codeSentTo ? (
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
          </DialogDescription>
        </div>

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
                    <Icons.Loader className="size-4 animate-spin" />
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
            <a
              className={FOOTER_LINK}
              href={`mailto:${siteConfig.links.email}`}
            >
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
      </DialogContent>
    </Dialog>
  );
}
