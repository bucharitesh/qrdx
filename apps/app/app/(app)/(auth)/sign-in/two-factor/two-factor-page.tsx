"use client";

import { QrdxLogoAnimation } from "@repo/design-system/components/brand/qrdx-logo-animation";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { signInPath } from "@/lib/safe-redirect";
import {
  SECOND_STEP_TITLES,
  type SecondStep,
} from "../../components/second-step";
import { TwoFactorChallenge } from "../../components/two-factor-challenge";

/**
 * The challenge on a page of its own, styled like /sign-in. Without a
 * pending challenge (it expired, or was finished in another tab) it offers to
 * sign in again instead.
 */
export function TwoFactorPage({
  next,
  pending,
}: {
  next: string;
  pending: boolean;
}) {
  const t = useTranslations("app.signIn.twoFactor.twoFactorPage");
  const router = useRouter();
  const [step, setStep] = useState<SecondStep | null>(null);

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="bg-card w-full max-w-sm overflow-hidden rounded-xl border shadow-sm">
        <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
          <QrdxLogoAnimation className="mb-3" size={52} />
          <h1 className="text-xl font-semibold tracking-tight">
            {pending
              ? step
                ? SECOND_STEP_TITLES[step]
                : t("twoStepVerification")
              : t("signInAgain")}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {pending ? t("yourAccountAsksForA") : t("thisSignInTimedOut")}
          </p>
        </div>
        <div className="px-6 pb-6">
          {pending ? (
            <TwoFactorChallenge
              onCancel={() => router.push(signInPath(next))}
              onStepChange={setStep}
              // A full load, so every server-rendered part sees the session.
              onVerified={() => window.location.assign(next)}
            />
          ) : (
            <Button asChild className="w-full max-sm:h-10" variant="outline">
              <Link href={signInPath(next)}>{t("signInAgain")}</Link>
            </Button>
          )}
        </div>
      </div>
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center rounded-sm px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href="/"
      >
        {t("backToQrdx")}
      </Link>
    </main>
  );
}
