import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { isPathAvailable } from "@/lib/feature-availability";
import type { Locale } from "@/lib/i18n/config";
import { localizeHref } from "@/lib/i18n/paths";

/** The product pages a docs reader is most likely to want next. */
const LINKS = [
  { href: "/playground", key: "links.playground" },
  { href: "/qr-code-generator", key: "links.generators" },
  { href: "/barcode-generator", key: "links.barcode" },
  { href: "/compare", key: "columns.compare" },
  { href: "/pricing", key: "links.pricing" },
] as const;

/**
 * A slim footer under every docs page. The sidebar only links inside /docs,
 * so without it the docs never point readers (or crawlers) at the product.
 * It reuses the site footer's copy and sits in a row of its own under the
 * page, in the content column of fumadocs' DocsLayout grid (column 3) at the
 * article's width. Spanning the whole grid instead would let its width grow
 * the grid's min-content side columns and squeeze the page on phones.
 */
export async function DocsProductLinks({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const links = LINKS.filter(({ href }) => isPathAvailable(href));

  return (
    <footer className="col-start-3 col-end-4 row-start-5 flex justify-center">
      <nav
        aria-label={t("navLabel")}
        className="mx-4 mb-8 flex w-full max-w-[calc(900px-2rem)] flex-wrap items-center gap-x-5 gap-y-2 border-t pt-6 text-sm md:mx-6 md:max-w-[calc(900px-3rem)] xl:mx-8 xl:max-w-[calc(900px-4rem)]"
      >
        <Link
          className="font-medium text-fd-foreground"
          href={localizeHref("/", locale)}
        >
          QRdx
        </Link>
        {links.map(({ href, key }) => (
          <Link
            className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            href={localizeHref(href, locale)}
            key={href}
            prefetch={false}
          >
            {t(key)}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
