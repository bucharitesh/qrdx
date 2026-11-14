"use client";

// One line under the plan cards: the money-back guarantee (every
// deployment that sells plans; content/legal/refunds.mdx) and, where it's
// offered, the non-profit discount with its request form.

import { authClient } from "@repo/auth/client";
import { cn } from "@repo/design-system/lib/utils";
import { Lovely, MoneyRecive } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { LocaleLink } from "@/components/i18n/locale-link";
import { NonprofitRequestDialog } from "@/components/sections/pricing/nonprofit-request-dialog";
import { MONEY_BACK_DAYS, NONPROFIT_DISCOUNT_PERCENT } from "@/lib/pricing";
import { useAuthStore } from "@/store/auth-store";

const LINK =
  "rounded-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function PricingOffers({
  signedIn,
  className,
}: {
  /** Signed in (the session, or a plan the server already knows) */
  signedIn: boolean;
  className?: string;
}) {
  const t = useTranslations("pricing.offers");
  const nonprofit = useAvailability().has("nonprofitDiscounts");
  const { data: session } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full max-w-[80rem] flex-col items-center gap-x-8 gap-y-2.5 px-10 text-sm text-muted-foreground md:flex-row md:justify-center",
        className,
      )}
    >
      <p
        className="flex scroll-mt-24 items-start gap-2 text-pretty md:items-center"
        id="money-back"
      >
        <MoneyRecive
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-foreground/70 md:mt-0"
        />
        <span>
          {t("moneyBack", { days: MONEY_BACK_DAYS })}{" "}
          <LocaleLink className={LINK} href="/legal/refunds">
            {t("moneyBackLink")}
          </LocaleLink>
        </span>
      </p>
      {nonprofit && (
        <p
          className="flex scroll-mt-24 items-start gap-2 text-pretty md:items-center"
          id="nonprofit"
        >
          <Lovely
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-foreground/70 md:mt-0"
          />
          <span>
            {t("nonprofit", { percent: NONPROFIT_DISCOUNT_PERCENT })}{" "}
            <button
              className={LINK}
              onClick={() => {
                if (!signedIn) {
                  openAuthDialog("signin");
                  return;
                }
                setOpen(true);
              }}
              type="button"
            >
              {t("nonprofitLink")}
            </button>
          </span>
        </p>
      )}
      {nonprofit && signedIn && (
        <NonprofitRequestDialog
          email={session?.user?.email ?? ""}
          onOpenChange={setOpen}
          open={open}
        />
      )}
    </div>
  );
}
