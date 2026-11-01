"use client";

import { usePromptRequirement } from "@c15t/nextjs";
import { useHeadlessConsentUI } from "@c15t/nextjs/headless";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { Setting4, ShieldTick } from "iconsax-reactjs";
import Link from "next/link";
import { ACTION_LABELS, PRIVACY_POLICY_URL, TEXT_LINK } from "./consent-copy";

/**
 * First-visit prompt: a floating card (overlay, so no layout shift).
 *
 * It appears after hydration, seconds after the page's own content on a slow
 * phone, so its text must stay smaller than a page's hero copy or it becomes
 * the page's LCP element: one short sentence, no icon on phones.
 */
export function CookieBanner() {
  const { banner, dialog, performBannerAction } = useHeadlessConsentUI();
  const prompt = usePromptRequirement();
  // Stays mounted under "Customise" while a choice is owed, so closing the
  // dialog hands focus back to the button that opened it.
  const visible =
    banner.isVisible || (dialog.isVisible && prompt.kind === "choice");

  if (!visible) return null;

  return (
    <section
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:animate-none sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[26rem]"
    >
      <Card className="gap-4 py-5 shadow-lg">
        <CardContent className="flex gap-3 px-5">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40 max-sm:hidden"
          >
            <ShieldTick variant="Bulk" className="size-4 text-foreground/80" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="cookie-banner-title"
              className="text-sm font-semibold leading-snug"
            >
              Cookies on QRdx
            </h2>
            <p
              id="cookie-banner-description"
              className="text-pretty text-sm text-muted-foreground"
            >
              We count visits without cookies; PostHog and the feedback widget
              wait for your OK.{" "}
              <Link
                href={PRIVACY_POLICY_URL}
                className={TEXT_LINK}
                prefetch={false}
              >
                Privacy policy
              </Link>
            </p>
          </div>
        </CardContent>
        <CardFooter className="grid grid-cols-2 gap-2 px-5 sm:grid-cols-3">
          {banner.orderedActions.map((action) => (
            <Button
              key={action}
              type="button"
              variant="outline"
              className={cn(
                action === "customize" && "col-span-2 sm:col-span-1",
              )}
              onClick={() => void performBannerAction(action)}
            >
              {action === "customize" && <Setting4 aria-hidden="true" />}
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </CardFooter>
      </Card>
    </section>
  );
}
