import { Card } from "@repo/design-system/components/ui/card";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { SpotlightCard } from "@/components/fx/spotlight-card";
import { MockupImage } from "@/components/mockups/mockup-image";
import { PRESSABLE } from "@/components/mockups/motion";
import { Reveal } from "@/components/mockups/reveal";
import { useCaseImages, type Visual } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import { generatorPath } from "@/lib/landing/generator-paths";
import {
  type ShowcaseStyleName,
  showcaseThemeStyles,
} from "@/lib/landing/showcase-styles";
import { playgroundDesignHref } from "@/lib/playground-style";
import type { ContentType } from "@/types/qr-content";

export interface UseCase {
  title: string;
  description: string;
  /** Where the card goes. */
  href: string;
  linkText: string;
  /** The type's generator page, linked from `linkText` beside the card's own link. */
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
    title: "Menus and tables",
    description: "Link a table tent or counter card to your online menu.",
    ...startWith("url", "menu"),
    linkText: "URL QR code",
    image: useCaseImages.cafeTableTent,
  },
  {
    title: "Business cards",
    description: "Save your name, number and email to a phone in one scan.",
    ...startWith("vcard", "signature"),
    linkText: "vCard QR code",
    image: useCaseImages.businessCard,
  },
  {
    title: "Guest Wi-Fi",
    description: "Let guests join the network without typing the password.",
    ...startWith("wifi", "dots"),
    linkText: "Wi-Fi QR code",
    image: useCaseImages.hotelWifi,
  },
  {
    title: "Payments",
    description: "Take UPI payments at a stall, shop counter or delivery.",
    ...startWith("upi", "classy"),
    linkText: "UPI QR code",
    image: useCaseImages.marketStallUpi,
  },
  {
    title: "Packaging and labels",
    description: "Turn a CSV into a ZIP of codes for every product or asset.",
    href: "/tools/bulk",
    linkText: "Bulk generator",
    image: useCaseImages.productPackaging,
  },
  {
    title: "Events and check-ins",
    description: "Check people in at the door with a Google Form.",
    ...startWith("attendance", "ticket"),
    linkText: "Attendance QR code",
    image: useCaseImages.eventCheckIn,
  },
  {
    title: "Shelves and displays",
    description: "Send shoppers from a shelf tag to your product listing.",
    ...startWith("amazon", "facet"),
    linkText: "Amazon QR code",
    image: useCaseImages.retailShelf,
  },
  {
    title: "Posters and signs",
    description: "Print it big enough to scan from across the street.",
    href: "/tools/print-size",
    linkText: "Print size calculator",
    image: useCaseImages.busStopPoster,
  },
];

export function UseCasesSection() {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-heading"
      className="flex w-full flex-col items-center"
    >
      <SectionHeader eyebrow="Use cases" pattern="ramp" focus={[0, 0]}>
        <h2
          id="use-cases-heading"
          className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance"
        >
          A QR code for every job
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          From café tables to bus stops, start from the right kind of code for
          the job.
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
                      aria-label={`${useCase.title}: ${useCase.about ? "start in the playground" : `open the ${useCase.linkText.toLowerCase()}`}`}
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
                        {useCase.title}
                      </h3>
                      <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
                        {useCase.description}
                      </p>
                      <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm font-medium text-foreground">
                        {useCase.about ? (
                          <Link
                            className="relative z-10 rounded-sm underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href={useCase.about}
                          >
                            {useCase.linkText}
                          </Link>
                        ) : (
                          useCase.linkText
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
