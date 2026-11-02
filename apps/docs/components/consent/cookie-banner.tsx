"use client";

import { useHasConsentPolicy, usePromptRequirement } from "@c15t/nextjs";
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
import { useLayoutEffect } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { ACTION_LABELS, PRIVACY_POLICY_URL, TEXT_LINK } from "./consent-copy";
import {
  CONSENT_EARLY_TAP_ATTRIBUTE,
  EARLY_BANNER_ACTIONS,
  takeEarlyConsentTap,
} from "./consent-early";

/**
 * First-visit prompt: a floating card (overlay, so no layout shift).
 *
 * It is in the server HTML of every page, hidden unless ConsentEarlyScript
 * found no stored choice, so it paints with the page instead of seconds later
 * after hydration (when it was the LCP element on pages with little text,
 * like /playground). Once c15t has resolved the policy, its state decides.
 */
export function CookieBanner() {
  const mounted = useMounted();
  const ready = useHasConsentPolicy();
  const { banner, dialog, performBannerAction } = useHeadlessConsentUI();
  const prompt = usePromptRequirement();
  // Server HTML, hydration and c15t's start: the early banner, shown only
  // where the head script set the attribute.
  const early = !(mounted && ready);
  // Stays mounted under "Customise" while a choice is owed, so closing the
  // dialog hands focus back to the button that opened it.
  const visible =
    banner.isVisible || (dialog.isVisible && prompt.kind === "choice");

  // Record a tap made on the early banner once c15t shows the same prompt
  // (before paint, so an accepted banner doesn't flash back).
  useLayoutEffect(() => {
    if (early || !visible) return;
    const tap = takeEarlyConsentTap();
    if (tap) void performBannerAction(tap);
  }, [early, visible, performBannerAction]);

  if (!early && !visible) return null;

  const actions = early ? EARLY_BANNER_ACTIONS : banner.orderedActions;

  return (
    <section
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
      className={cn(
        "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:animate-none sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[26rem]",
        // Painted with the page: no entrance animation (and no restart of
        // one when c15t takes over the same element).
        "[:root[data-consent-prompt]_&]:animate-none",
        early && "hidden [:root[data-consent-prompt]_&]:block",
      )}
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
          {actions.map((action) => (
            <Button
              key={action}
              type="button"
              variant="outline"
              className={cn(
                action === "customize" && "col-span-2 sm:col-span-1",
              )}
              {...{ [CONSENT_EARLY_TAP_ATTRIBUTE]: early ? action : undefined }}
              // Early taps are held by ConsentEarlyScript and replayed above.
              onClick={
                early ? undefined : () => void performBannerAction(action)
              }
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
