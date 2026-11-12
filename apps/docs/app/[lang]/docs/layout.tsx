import type { Root } from "fumadocs-core/page-tree";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/base";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { DocsFrameworkProvider } from "@/components/docs/docs-framework-provider";
import { DocsLocaleMenu } from "@/components/docs/docs-locale-menu";
import { DocsProductLinks } from "@/components/docs/docs-product-links";
import CustomSearchDialog from "@/components/search";
import { JsonLd } from "@/components/sections/tools/json-ld";
import { docsTabs, filterPageTree, mapLinkNodes } from "@/lib/docs-tree";
import { isPathAvailable } from "@/lib/feature-availability";
import { LOCALE_INFO, type Locale } from "@/lib/i18n/config";
import { englishDocsPath } from "@/lib/i18n/docs";
import {
  fumadocsTranslations,
  requireDocsLocale,
} from "@/lib/i18n/docs-server";
import { CHROME_NAMESPACES, pickMessages } from "@/lib/i18n/messages";
import { localizeHref, localizePath } from "@/lib/i18n/paths";
import { baseOptions, linkItems, logo } from "@/lib/layout.shared";
import { organizationSchema } from "@/lib/seo-schema";
import { localizedSource } from "@/lib/source";
import "katex/dist/katex.min.css";

/** What the docs' client components translate (search, page actions, language menu). */
const DOCS_CLIENT_NAMESPACES = [...CHROME_NAMESPACES, "docs.client"] as const;

const trees = new Map<Locale, Root>();

/**
 * The sidebar in `locale`: no entry for docs of features this deployment
 * can't offer, and links out of the docs to that language's pages.
 */
function sidebarTree(locale: Locale): Root {
  const cached = trees.get(locale);
  if (cached) return cached;
  const tree = mapLinkNodes(
    filterPageTree(localizedSource.getPageTree(locale), (url) =>
      isPathAvailable(englishDocsPath(url)),
    ),
    (url) => localizeHref(url, locale),
  );
  trees.set(locale, tree);
  return tree;
}

export default async function Layout({
  children,
}: LayoutProps<"/[lang]/docs">) {
  const locale = await requireDocsLocale();
  const [messages, translations] = await Promise.all([
    getMessages(),
    fumadocsTranslations(locale),
  ]);
  const tree = sidebarTree(locale);

  return (
    <DocsFrameworkProvider>
      <TreeContextProvider tree={localizedSource.getPageTree(locale)}>
        <NextIntlClientProvider
          messages={pickMessages(messages, DOCS_CLIENT_NAMESPACES)}
        >
          <RootProvider
            i18n={{ locale: LOCALE_INFO[locale].segment, translations }}
            search={{ SearchDialog: CustomSearchDialog }}
          >
            <DocsLayout
              tree={tree}
              // Help, Guides, Developers, React library and Self-hosting:
              // tabs above the page on desktop, a switcher in the mobile
              // menu (lib/docs-tree.ts).
              tabs={docsTabs(tree)}
              tabMode="top"
              {...baseOptions()}
              links={linkItems.filter((item) => item.type === "icon")}
              nav={{
                ...baseOptions().nav,
                url: localizePath("/", locale),
                title: (
                  <>
                    {logo}
                    <span className="font-medium in-[docs_layout_&]:text-[15px]">
                      QRdx
                    </span>
                  </>
                ),
              }}
              sidebar={{ footer: <DocsLocaleMenu /> }}
            >
              <JsonLd data={organizationSchema} />
              {/* Neutral light from the top right (the old image was a blue glow).
                  Light mode needs half the ink, or it reads as a grey smudge. */}
              <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--color-foreground)_3.5%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--color-foreground)_7%,transparent),transparent)]"
              />
              {children}
              <DocsProductLinks locale={locale} />
            </DocsLayout>
          </RootProvider>
        </NextIntlClientProvider>
      </TreeContextProvider>
    </DocsFrameworkProvider>
  );
}
