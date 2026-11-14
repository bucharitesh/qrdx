import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  CalendarTick,
  Forbidden2,
  type Icon,
  Import,
  Link2,
  ScanBarcode,
  ShieldTick,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import type { Messages } from "@/lib/i18n/messages";
import en from "@/messages/en.json";

/** "Never-Hostage" is never translated; "Guarantee" is (messages/glossary.json). */
export const GUARANTEE_NAME = "Never-Hostage Guarantee";

type PromiseKey = keyof Messages["pricing"]["guarantee"]["promises"];

export interface GuaranteePromise {
  key: PromiseKey;
  icon: Icon;
  /** English (the guarantee page and /pricing.md); GuaranteeBlock translates. */
  title: string;
  body: string;
}

const promise = (key: PromiseKey, icon: Icon): GuaranteePromise => ({
  key,
  icon,
  ...en.pricing.guarantee.promises[key],
});

/** The guarantee's promises; app/[lang]/(home)/guarantee renders the full page. */
export const GUARANTEE_PROMISES: GuaranteePromise[] = [
  promise("static", ScanBarcode),
  promise("redirecting", Link2),
  promise("noAds", Forbidden2),
  promise("limits", ShieldTick),
  promise("export", Import),
  promise("notice", CalendarTick),
];

/** Short version for the pricing page. */
export function GuaranteeBlock({ className }: { className?: string }) {
  const t = useTranslations("pricing.guarantee");
  return (
    <section
      aria-labelledby="guarantee"
      className={cn("w-full px-10 py-16 md:py-20", className)}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <ShieldTick aria-hidden className="size-4" variant="Bold" />
              {t("eyebrow")}
            </p>
            <h2
              id="guarantee"
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
            >
              {t("title")}
            </h2>
            <p className="text-pretty text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Link
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            href="/guarantee"
          >
            {t("link")}
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUARANTEE_PROMISES.map((promise) => (
            <li key={promise.key}>
              <Card className="h-full gap-3 p-5 shadow-xs">
                <span className="grid size-9 place-items-center rounded-full border bg-muted/40">
                  <promise.icon
                    aria-hidden
                    className="size-4 text-foreground/80"
                  />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-medium tracking-tight">
                    {t(`promises.${promise.key}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {t(`promises.${promise.key}.body`)}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
