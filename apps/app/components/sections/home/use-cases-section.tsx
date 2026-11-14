import { Card } from "@repo/design-system/components/ui/card";
import { ArrowRight } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { SpotlightCard } from "@/components/fx/spotlight-card";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { MockupImage } from "@/components/mockups/mockup-image";
import { PRESSABLE } from "@/components/mockups/motion";
import { Reveal } from "@/components/mockups/reveal";
import { useCaseImages, type Visual } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import type { Messages } from "@/lib/i18n/messages";
import { generatorPath } from "@/lib/landing/generator-paths";
import {
  type ShowcaseStyleName,
  showcaseThemeStyles,
} from "@/lib/landing/showcase-styles";
import { playgroundDesignHref } from "@/lib/playground-style";
import type { ContentType } from "@/types/qr-content";

export interface UseCase {
  /** Its copy: messages (home.useCases.items.<key>). */
  key: keyof Messages["home"]["useCases"]["items"];
  /** Where the card goes. */
  href: string;
  /** The type's generator page, linked from the card's link text beside its own link. */
  about?: string;
  image: Visual;
}

/**
 * The playground on the job's content type, in the look of the code in the
 * card's illustration (scripts/use-case-art/codes.ts names it), with QRdx's
 * generic sample for the type where it has one. The type's generator page
 * stays linked from the card too: the home page's links are how search
 * engines find those pages.
 */
const startWith = (type: ContentType, look: ShowcaseStyleName) => ({
  href: playgroundDesignHref({
    type,
    sample: true,
    design: showcaseThemeStyles(look),
  }),
  about: generatorPath(type),
});

export const useCases: UseCase[] = [
  {
    key: "menus",
    ...startWith("url", "menu"),
    image: useCaseImages.cafeTableTent,
  },
  {
    key: "businessCards",
    ...startWith("vcard", "signature"),
    image: useCaseImages.businessCard,
  },
  {
    key: "wifi",
    ...startWith("wifi", "dots"),
    image: useCaseImages.hotelWifi,
  },
  {
    key: "payments",
    ...startWith("upi", "classy"),
    image: useCaseImages.marketStallUpi,
  },
  {
    key: "packaging",
    href: "/tools/bulk",
    image: useCaseImages.productPackaging,
  },
  {
    key: "events",
    ...startWith("attendance", "ticket"),
    image: useCaseImages.eventCheckIn,
  },
  {
    key: "shelves",
    ...startWith("amazon", "facet"),
    image: useCaseImages.retailShelf,
  },
  {
    key: "posters",
    href: "/tools/print-size",
    image: useCaseImages.busStopPoster,
  },
];

export function UseCasesSection() {
  const t = useTranslations("home.useCases");
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader eyebrow={t("eyebrow")} pattern="ramp" focus={[0, 0]}>
        <h2
          id="use-cases-heading"
          className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance"
        >
          {t("title")}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {t("description")}
        </p>
      </SectionHeader>
      <ul className="grid w-full gap-4 px-10 py-12 sm:grid-cols-2 md:py-16 lg:grid-cols-4">
        {useCases.map((useCase, index) => (
          <li key={useCase.href}>
            <Reveal delay={(index % 4) * 60} className="h-full">
              {/* Two separate links, never one inside the other: the card
                  (stretched over it) opens the playground, and the type
                  name at the bottom opens its generator page. */}
              <div
                className={`group h-full rounded-xl has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-4 has-[[data-card-link]:focus-visible]:outline-ring ${PRESSABLE}`}
              >
                <SpotlightCard asChild>
                  <Card className="h-full gap-0 py-0 transition-[border-color,box-shadow] duration-200 group-hover:border-foreground/15 group-hover:shadow-md">
                    <Link
                      aria-label={t(`items.${useCase.key}.cardLabel`)}
                      className="absolute inset-0 z-0 rounded-[inherit] outline-none"
                      data-card-link=""
                      href={useCase.href}
                    />
                    <div className="p-1.5 pb-0">
                      <div className="aspect-[4/3] overflow-hidden rounded-[20px] bg-muted">
                        {/* Decorative: the card's title names the scene. */}
                        <MockupImage
                          {...useCase.image}
                          alt=""
                          bare
                          className="h-full object-cover transition-transform duration-500 ease-[cubic-bezier(.32,.72,0,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 px-4 pt-4 pb-4">
                      <h3 className="font-medium tracking-tight text-foreground">
                        {t(`items.${useCase.key}.title`)}
                      </h3>
                      <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
                        {t(`items.${useCase.key}.description`)}
                      </p>
                      <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm font-medium text-foreground">
                        {useCase.about ? (
                          <Link
                            className="relative z-10 rounded-sm underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href={useCase.about}
                          >
                            {t(`items.${useCase.key}.linkText`)}
                          </Link>
                        ) : (
                          t(`items.${useCase.key}.linkText`)
                        )}
                        <span
                          aria-hidden="true"
                          className="grid size-7 place-items-center rounded-full border bg-background text-muted-foreground transition-[color,transform,border-color] duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover:translate-x-0.5 group-hover:border-foreground/20 group-hover:text-foreground"
                        >
                          <ArrowRight className="size-3.5" />
                        </span>
                      </span>
                    </div>
                  </Card>
                </SpotlightCard>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
