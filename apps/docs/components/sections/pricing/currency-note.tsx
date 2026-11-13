"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { LocaleLink } from "@/components/i18n/locale-link";
import { EUR_PRICES, type PricingCurrency } from "@/lib/pricing";
import {
  CURRENCY_COOKIE,
  CURRENCY_COOKIE_MAX_AGE,
  CURRENCY_PARAM,
  overrideForCurrency,
} from "@/lib/region";

const LINK =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

/** The currencies a visitor seeing `currency` can switch to. */
export function switchTargets(
  currency: PricingCurrency,
  eur: boolean = EUR_PRICES,
): PricingCurrency[] {
  if (currency !== "USD") return ["USD"];
  return eur ? ["INR", "EUR"] : ["INR"];
}

/**
 * "Prices in ₹ for India" note with a switch; the choice is kept in a
 * cookie. Display only: checkout charges the currency of the visitor's
 * country (lib/region.ts checkoutCurrency).
 */
export function CurrencyNote({ currency }: { currency: PricingCurrency }) {
  const t = useTranslations("pricing.currency");
  const note = { USD: "usd", INR: "inr", EUR: "eur" } as const;
  const label = { USD: "showUsd", INR: "showInr", EUR: "showEur" } as const;

  const remember = (next: PricingCurrency) => () => {
    try {
      // biome-ignore lint/suspicious/noDocumentCookie: a display preference; the server reads it on the next render
      document.cookie = `${CURRENCY_COOKIE}=${overrideForCurrency(next)}; path=/; max-age=${CURRENCY_COOKIE_MAX_AGE}; samesite=lax`;
    } catch {
      // Blocked cookies: the ?currency param still applies.
    }
  };

  return (
    <p className="text-center text-sm text-balance text-muted-foreground">
      {t(note[currency])}{" "}
      {switchTargets(currency).map((next, index) => (
        <Fragment key={next}>
          {index > 0 && <span aria-hidden> · </span>}
          <LocaleLink
            className={LINK}
            href={`/pricing?${CURRENCY_PARAM}=${overrideForCurrency(next)}`}
            onClick={remember(next)}
            replace
            scroll={false}
          >
            {t(label[next])}
          </LocaleLink>
        </Fragment>
      ))}
    </p>
  );
}
