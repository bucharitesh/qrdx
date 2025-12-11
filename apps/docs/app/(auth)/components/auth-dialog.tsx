"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Github from "@/assets/github.svg";
import Google from "@/assets/google.svg";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { authClient } from "@/lib/auth-client";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "signin" | "signup";
  trigger?: React.ReactNode; // Optional trigger element
}

export function AuthDialog({
  open,
  onOpenChange,
  initialMode = "signin",
  trigger,
}: AuthDialogProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSignIn, setIsSignIn] = useState(initialMode === "signin");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);

  const getCallbackUrl = () => {
    const baseUrl = pathname || "/editor/theme";
    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  useEffect(() => {
    if (open) {
      setIsSignIn(initialMode === "signin");
      // Get the last used login method
      const lastMethod = authClient.getLastUsedLoginMethod();
      setLastLoginMethod(lastMethod);
    }
  }, [open, initialMode]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: getCallbackUrl(),
      });
    } catch (error) {
      console.error("Google Sign In Error:", error);
      // Handle error appropriately (e.g., show a toast notification)
    }
  };

  const handleGithubSignIn = async () => {
    setIsGithubLoading(true);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: getCallbackUrl(),
      });
    } catch (error) {
      console.error("GitHub Sign In Error:", error);
      // Handle error appropriately
    }
  };

  const toggleMode = () => {
    setIsSignIn(!isSignIn);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl">
      {trigger}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
      <div className="relative z-10 flex p-4 h-full w-full max-w-120 flex-1 flex-col justify-center gap-y-6">
        <div className="relative grid flex-1 content-center">
          <Card className="w-full max-w-md overflow-hidden shadow-lg p-6 relative">
            <div className="space-y-4">
              <div className="space-y-2">
                <QrdxLogoAnimation size={60} className="mx-auto mb-8" />
                <h2 className="text-center text-lg font-bold">
                  {isSignIn ? "Sign in to QRdx" : "Create account"}
                </h2>
                <p className="text-muted-foreground text-center">
                  {isSignIn
                    ? "Welcome back! Please sign in to continue"
                    : "Sign up to get started with qrdx"}
                </p>
              </div>

              <div className="space-y-6 pt-4">
                <div className="flex gap-2 items-center justify-center">
                  <div className="relative w-full">
                    <Button
                      variant={"outline"}
                      onClick={handleGoogleSignIn}
                      className="hover:bg-primary/10 hover:text-foreground flex w-full items-center justify-center gap-2"
                      disabled={isGoogleLoading || isGithubLoading}
                    >
                      <Google className="h-5 w-5" />
                      <span className="font-medium">Google</span>
                      {isGoogleLoading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </Button>
                    {lastLoginMethod === "google" && (
                      <Badge className="absolute px text-[0.5rem] right-0 -top-1/2 translate-y-1/2">
                        Last used
                      </Badge>
                    )}
                  </div>

                  <div className="relative w-full">
                    <Button
                      variant={"outline"}
                      onClick={handleGithubSignIn}
                      className="hover:bg-primary/10 hover:text-foreground flex w-full items-center justify-center gap-2"
                      disabled={isGoogleLoading || isGithubLoading}
                    >
                      <Github className="h-5 w-5" />
                      <span className="font-medium">GitHub</span>
                      {isGithubLoading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </Button>
                    {lastLoginMethod === "github" && (
                      <Badge className="absolute px text-[0.5rem] right-0 -top-1/2 translate-y-1/2">
                        Last used
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="mt-6 text-muted-foreground text-sm font-medium text-center gap-2 flex items-center justify-center">
                    Don't have an account?
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="text-primary focus:ring-primary hover:underline focus:ring-2 focus:ring-offset-2 focus:outline-none"
                    >
                      {isSignIn ? "Sign up" : "Sign in to your account"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <footer className="flex w-full max-w-120 justify-between text-sm">
          <p className="text-muted-foreground">
            © {new Date().getFullYear()} QRdx
          </p>
          <ul className="flex gap-2">
            <li className="flex items-center gap-2 after:size-[1.5px] after:rounded-full after:bg-muted-foreground last:after:hidden">
              <button
                type="button"
                className="relative rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[#0033FF]"
              >
                Support
              </button>
            </li>
            <li className="flex items-center gap-2 after:size-[1.5px] after:rounded-full after:bg-muted-foreground last:after:hidden">
              <Link
                className="relative rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[#0033FF]"
                href="/legal/privacy-policy"
              >
                Privacy
              </Link>
            </li>
            <li className="flex items-center gap-2 after:size-[1.5px] after:rounded-full after:bg-muted-foreground last:after:hidden">
              <Link
                className="relative rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[#0033FF]"
                href="/legal/terms-of-service"
              >
                Terms
              </Link>
            </li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
