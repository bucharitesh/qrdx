"use client";

import { authClient } from "@repo/auth/client";
import {
  GithubLogo,
  GoogleLogo,
  Spinner as Loader2,
} from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { OAuthAppLogo } from "@/components/oauth/oauth-app-logo";
import type { OAuthScope } from "@/lib/oauth-scopes";
import { AuthorizeShell, ScopeList } from "./oauth-consent";

/** Signed-out step: sign in, then the same URL shows the consent screen. */
export function OAuthSignIn({
  app,
  scopes,
  callbackURL,
}: {
  app: { name: string; logoUrl: string | null };
  scopes: OAuthScope[];
  callbackURL: string;
}) {
  const t = useTranslations("app.oauth.authorize.oauthSignIn");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleSignIn = async (provider: "google" | "github") => {
    setLoadingProvider(provider);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL,
      });
      // e.g. the provider is not configured on this server
      if (error) setLoadingProvider(null);
    } catch {
      setLoadingProvider(null);
    }
  };

  const isLoading = loadingProvider !== null;

  return (
    <AuthorizeShell>
      <div className="mb-8 flex flex-col items-center text-center">
        <OAuthAppLogo logoUrl={app.logoUrl} name={app.name} />
        <p className="text-muted-foreground mt-4 text-sm">
          {t("signInToQrdxTo")}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-balance">{app.name}</h1>
      </div>

      <div className="space-y-3">
        <Button
          className="h-10 w-full justify-center gap-2"
          disabled={isLoading}
          onClick={() => handleSignIn("google")}
          variant="outline"
        >
          <GoogleLogo className="h-4 w-4" />
          {t("continueWithGoogle")}
          {loadingProvider === "google" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
        </Button>

        <Button
          className="h-10 w-full justify-center gap-2"
          disabled={isLoading}
          onClick={() => handleSignIn("github")}
          variant="outline"
        >
          <GithubLogo className="h-4 w-4" />
          {t("continueWithGithub")}
          {loadingProvider === "github" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
        </Button>
      </div>

      {scopes.length > 0 && (
        <div className="mt-8">
          <ScopeList appName={app.name} scopes={scopes} />
        </div>
      )}

      <p className="text-muted-foreground mt-6 text-center text-xs">
        {t("youllReviewThesePermissionsBefore")}
      </p>
    </AuthorizeShell>
  );
}
