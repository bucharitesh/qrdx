"use client";

import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { useTranslations } from "next-intl";
import { LocaleLink } from "@/components/i18n/locale-link";
import { ENTERPRISE_REPLY } from "@/lib/enterprise";

// The fourth plan card on /pricing: Enterprise is the Business plan under a
// contract (lib/enterprise.ts), so it has no checkout and no price of its
// own. Its button goes to /enterprise. Kept apart from the other cards
// (components/sections/pricing-section.tsx renders it last in the grid).

const ADDS = ["contract", "replies", "review", "selfHost"] as const;

export function EnterpriseCard() {
  const t = useTranslations("pricing.enterprise");
  return (
    <Card className="relative bg-muted/40 p-6 shadow-none dark:bg-card">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{t("name")}</h2>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-4xl font-semibold tracking-tight">{t("price")}</p>
        <p className="text-xs text-muted-foreground">{t("priceNote")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button asChild className="w-full" variant="outline">
          <LocaleLink href="/enterprise">{t("cta")}</LocaleLink>
        </Button>
        <div className="text-center text-xs text-muted-foreground">
          <LocaleLink
            className="rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/security"
          >
            {t("security")}
          </LocaleLink>
        </div>
      </div>
      <hr className="border-border" />
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{t("lead")}</p>
        <ul className="flex flex-col gap-2.5">
          {ADDS.map((item) => (
            <li className="flex items-start gap-2.5 text-sm" key={item}>
              <Tick
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                strokeWidth={2}
              />
              <span className="text-foreground/90">
                {item === "replies"
                  ? t("adds.replies", {
                      hours: ENTERPRISE_REPLY.outageBusinessHours,
                    })
                  : t(`adds.${item}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
