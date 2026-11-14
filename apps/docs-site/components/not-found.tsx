import Link from "fumadocs-core/link";
import { ArrowRight } from "iconsax-reactjs";
import { getLocale, getTranslations } from "next-intl/server";
import { HairlineFigure } from "@/components/mockups/hairline";
import { localizeHref } from "@/lib/i18n/paths";

/** Where to go instead (copy: docs.notFound.places in the catalog). */
const PLACES = [
  { key: "gettingStarted", href: "/docs/getting-started" },
  { key: "dynamic", href: "/docs/dynamic-qr-codes" },
  { key: "restApi", href: "/docs/developers/rest-api" },
  { key: "components", href: "/docs/components/qr-code" },
] as const;

/**
 * Docs 404, shown inside the docs layout so the sidebar and search stay.
 * In the docs' language, with links to that language's pages.
 */
export async function DocsNotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "docs.notFound" });
  return (
    // [grid-area:main] places it in the docs layout grid, like DocsPage does.
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center [grid-area:main]">
      <HairlineFigure className="h-32 w-44" figure="LostCode" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t("title")}
        </h1>
        <p className="text-pretty text-fd-muted-foreground">{t("body")}</p>
      </div>
      <ul className="grid w-full gap-2 text-left sm:grid-cols-2">
        {PLACES.map((place) => (
          <li key={place.href}>
            <Link
              href={localizeHref(place.href, locale)}
              className="group flex h-full flex-col gap-0.5 rounded-xl border bg-fd-card p-4 transition-colors hover:border-fd-foreground/15 hover:bg-fd-accent/60"
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-fd-foreground">
                {t(`places.${place.key}.title`)}
                <ArrowRight
                  aria-hidden
                  className="size-3.5 text-fd-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
              <span className="text-sm text-fd-muted-foreground">
                {t(`places.${place.key}.description`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
