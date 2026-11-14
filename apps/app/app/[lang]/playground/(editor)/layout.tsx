import { JsonLd } from "@repo/design-system/components/seo/json-ld";
import { localizeHref } from "@repo/i18n/paths";
import { getLocale, getTranslations } from "next-intl/server";
import { breadcrumbSchema } from "@/components/sections/tools/json-ld";
import { baseUrl } from "@/lib/metadata";
import { PRODUCT_FACTS } from "@/lib/product-facts";
import { organizationId } from "@/lib/seo-schema";
import { CONTENT_TYPES_METADATA } from "@/types/qr-content";

const LINKS = [
  { href: "/qr-code-generator", key: "allTypes" },
  { href: "/tools/scan-checker", key: "scanChecker" },
  { href: "/tools/print-size", key: "printSize" },
  { href: "/docs/styles", key: "styleGuide" },
] as const;

/**
 * What the designer does, for screen readers and crawlers that don't run
 * JavaScript. Not shown on screen (the owner removed the visible strip under
 * the editor); the same honest description stays in the first HTML.
 *
 * It lives here, not in page.tsx: ./loading.tsx wraps the page in a Suspense
 * boundary, so everything the page renders reaches the HTML as a hidden chunk
 * that only JavaScript reveals. A layout renders outside its own segment's
 * loading boundary. Plain links and no client components.
 */
async function PlaygroundIntro() {
  const [t, locale] = await Promise.all([
    getTranslations("playground.intro"),
    getLocale(),
  ]);
  const { bodyPatterns, eyeShapes, frames } = PRODUCT_FACTS;
  return (
    <section aria-label={t("label")} className="sr-only">
      <p>{t("summary")}</p>
      <p>
        {t("types", {
          types: CONTENT_TYPES_METADATA.length,
          bodyPatterns,
          eyeShapes,
          frames,
        })}
      </p>
      <p>{t("downloads")}</p>
      <ul>
        {LINKS.map((link) => (
          <li key={link.href}>
            <a href={localizeHref(link.href, locale)}>
              {t(`links.${link.key}`)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The designer as a free web app, and its place in the site, as
 * /barcode-generator describes itself. Facts match the intro above.
 */
async function PlaygroundSchema() {
  const [common, t, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("playground"),
    getLocale(),
  ]);
  const path = localizeHref("/playground", locale);
  const { bodyPatterns, eyeShapes, frames } = PRODUCT_FACTS;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "QRdx QR code designer",
          url: new URL(path, baseUrl).toString(),
          applicationCategory: "DesignApplication",
          operatingSystem: "Any (web browser)",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          provider: { "@id": organizationId },
          featureList: [
            `${CONTENT_TYPES_METADATA.length} content types, including links, Wi-Fi networks, contact cards and payments`,
            `${bodyPatterns} dot patterns and ${eyeShapes} corner-eye shapes`,
            "Solid or gradient colors and a center logo",
            `${frames} call-to-action frames`,
            "Scan score before you print",
            "PNG, JPG, WebP, SVG, PDF and EPS downloads",
          ],
        }}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: common("home"), path: localizeHref("/", locale) },
          { name: t("heading"), path },
        ])}
      />
    </>
  );
}

/** /playground only; shared theme links ([...qrId]) canonicalize here. */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PlaygroundSchema />
      {children}
      <PlaygroundIntro />
    </>
  );
}
