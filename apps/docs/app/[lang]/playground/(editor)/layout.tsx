import { getLocale, getTranslations } from "next-intl/server";
import { localizeHref } from "@/lib/i18n/paths";
import { PRODUCT_FACTS } from "@/lib/product-facts";
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

/** /playground only; shared theme links ([...qrId]) canonicalize here. */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PlaygroundIntro />
    </>
  );
}
