import type { Locale } from "@/lib/i18n/config";
import type { TemplateDemo } from "@/lib/landing/demo";
import { CARD_BOX } from "../_lib/gallery";
import { TemplateCard } from "./template-card";

/**
 * Template cards as grid items of a section (../_lib/gallery.ts,
 * SECTION_CARDS), the way the page and the cards' server action draw them.
 */
export function SectionCards({
  demos,
  locale,
}: {
  demos: TemplateDemo[];
  locale: Locale;
}) {
  return demos.map((demo) => (
    <TemplateCard
      className={CARD_BOX}
      demo={demo}
      key={demo.path}
      locale={locale}
    />
  ));
}
