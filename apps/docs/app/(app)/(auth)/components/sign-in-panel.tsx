"use client";

import { authClient } from "@repo/auth/client";
import {
  OAUTH_LANDING_KEY,
  OAUTH_REFERRAL_KEY,
} from "@repo/auth/referral-keys";
import { toast } from "@repo/design-system";
import {
  GithubLogo,
  GoogleLogo,
  Spinner,
} from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import { useTranslations } from "next-intl";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { siteConfig } from "@/config/site";
import { SsoSignIn } from "@/ee/sso/sso-sign-in";
import { pendingReferralCode } from "@/lib/affiliates/referral-client";
import { signUpLanding } from "@/lib/analytics/landing";
import { socialSignInErrorPath } from "../sign-in/_lib/error-message";
import { EmailCodeSignIn } from "./email-code-sign-in";
import { PasskeySignIn } from "./passkey-sign-in";
import { SECOND_STEP_TITLES, type SecondStep } from "./second-step";

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
 * The sign-in UI itself: Google, GitHub, an email code, workspace SSO and a
 * passkey, with "Last used" and the legal footer. Where SSO runs, an email
 * whose company signs in with it is offered SSO before a code is sent
 * (email-code-sign-in.tsx). The dialog (auth-dialog.tsx) and the /sign-in
 * page both render it, so the two can't drift apart.
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
  const t = useTranslations("auth.signInPanel");
  const isSignIn = mode === "signin";
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);
  // Address the email code went to (the code step), and a key to start over.
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [emailFormKey, setEmailFormKey] = useState(0);
  // An address whose company signs in with SSO, while that's offered, and
  // whether its domain requires it.
  const [ssoOfferFor, setSsoOfferFor] = useState<string | null>(null);
  const [ssoOfferRequired, setSsoOfferRequired] = useState(false);
  // A step after the email (the code, or the SSO offer) has the panel.
  const emailStepPassed = Boolean(codeSentTo || ssoOfferFor);
  // The email code was right and two-step verification asks for a second
  // step; which method is on screen (null while it's worked out).
  const [twoFactor, setTwoFactor] = useState(false);
  const [secondStep, setSecondStep] = useState<SecondStep | null>(null);
  // Workspace SSO runs only on servers with a QRdx licence key.
  const ssoOffered = useAvailability().has("sso");
  const affiliates = useAvailability().has("affiliates");

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
      const next = callbackURL();
      // An affiliate link's code and how this visit started ride the OAuth
      // state to the new account (packages/auth/referral.ts); they only
      // count if this makes one.
      const referral = affiliates ? pendingReferralCode() : null;
      const landing = signUpLanding();
      const additionalData = {
        ...(referral ? { [OAUTH_REFERRAL_KEY]: referral } : {}),
        ...(landing ? { [OAUTH_LANDING_KEY]: landing } : {}),
      };
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: next,
        // A refusal (an unverified address, say) comes back to /sign-in,
        // which says why (sign-in/_lib/error-message.ts).
        errorCallbackURL: socialSignInErrorPath(next, provider),
        ...(referral || landing ? { additionalData } : {}),
      });
      // e.g. the provider is not configured on this server
      if (error) throw error;
    } catch (error) {
      console.error(`${label} Sign In Error:`, error);
      setLoading(false);
      toast.error(t("labelSignInIsNot", { label }));
    }
  };

  const handleEmailSignedIn = () => {
    onSignedIn?.();
    // After the dialog's close animation, so it doesn't flash the email step.
    window.setTimeout(() => {
      setCodeSentTo(null);
      setSsoOfferFor(null);
      setTwoFactor(false);
      setSecondStep(null);
      setEmailFormKey((key) => key + 1);
    }, 300);
  };

  const busy = isGoogleLoading || isGithubLoading;
  const providers = [
    {
      id: "google",
      label: t("google"),
      icon: GoogleLogo,
      loading: isGoogleLoading,
      onClick: () => socialSignIn("google", "Google", setIsGoogleLoading),
    },
    {
      id: "github",
      label: t("github"),
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
            ? secondStep
              ? SECOND_STEP_TITLES[secondStep]
              : t("twoStepVerification")
            : codeSentTo
              ? t("checkYourEmail")
              : ssoOfferFor
                ? t("signInWithSso")
                : isSignIn
                  ? t("signInToQrdx")
                  : t("createYourQrdxAccount")}
        </Title>
        <Description className="text-muted-foreground text-sm text-pretty">
          {twoFactor
            ? t("yourAccountAsksForA")
            : codeSentTo
              ? t.rich("codeSentTo", {
                  email: codeSentTo,
                  strong: (chunks) => (
                    <span className="font-medium break-all text-foreground">
                      {chunks}
                    </span>
                  ),
                })
              : ssoOfferFor
                ? ssoOfferRequired
                  ? t("yourCompanyRequiresSingleSign")
                  : t("yourCompanySignsInWith")
                : isSignIn
                  ? t("pickUpWhereYouLeft")
                  : t("freeToStartNoCard")}
        </Description>
      </div>

      {notice && !emailStepPassed && (
        <p
          className="bg-muted/60 mx-6 mb-4 rounded-md px-3 py-2 text-center text-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      {!emailStepPassed && (
        <div className="grid grid-cols-2 gap-2 px-6">
          {providers.map((provider) => (
            <div className="relative" key={provider.id}>
              <Button
                className="h-10 w-full sm:h-9"
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
                  {t("lastUsed")}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {!emailStepPassed && (
        <div className="flex items-center gap-3 px-6 py-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <Separator className="flex-1" />
        </div>
      )}

      <EmailCodeSignIn
        disabled={busy}
        key={emailFormKey}
        lastUsed={lastLoginMethod === "email-otp"}
        onSecondStepChange={setSecondStep}
        onSentToChange={setCodeSentTo}
        onSignedIn={handleEmailSignedIn}
        onSsoOfferChange={(email, required) => {
          setSsoOfferFor(email);
          setSsoOfferRequired(required);
        }}
        onTwoFactorChange={(active) => {
          setTwoFactor(active);
          if (!active) setSecondStep(null);
        }}
        redirectTo={redirectTo}
        sentTo={codeSentTo}
        sso={
          ssoOffered
            ? { callbackURL, lastUsed: lastLoginMethod === "sso" }
            : null
        }
      />

      {!emailStepPassed && ssoOffered && (
        <SsoSignIn
          callbackURL={callbackURL}
          disabled={busy}
          lastUsed={lastLoginMethod === "sso"}
        />
      )}

      {/* Last in the list: a passkey signs in on its own (it counts as both steps), but only for someone who already added one. */}
      {!emailStepPassed && isSignIn && (
        <PasskeySignIn
          disabled={busy}
          lastUsed={lastLoginMethod === "passkey"}
          onSignedIn={() => onSignedIn?.()}
          redirectTo={redirectTo}
        />
      )}

      {/* Google, GitHub, email codes and workspace SSO create the account on first use, so there's no separate sign-up step (a passkey needs an account first). */}
      {!emailStepPassed && (
        <p className="px-6 pt-4 pb-6 text-center text-xs text-pretty text-muted-foreground">
          {t("newToQrdxGoogleGithub")}
        </p>
      )}

      <footer className="flex items-center justify-between gap-4 border-t px-6 py-3 text-xs text-muted-foreground">
        <span>
          {t("valueQrdx", { value: String(new Date().getFullYear()) })}
        </span>
        <nav aria-label={t("helpAndLegal")} className="flex gap-3">
          <a className={FOOTER_LINK} href={`mailto:${siteConfig.links.email}`}>
            {t("support")}
          </a>
          <Link className={FOOTER_LINK} href="/legal/privacy-policy">
            {t("privacy")}
          </Link>
          <Link className={FOOTER_LINK} href="/legal/terms-of-service">
            {t("terms")}
          </Link>
        </nav>
      </footer>
    </>
  );
}
