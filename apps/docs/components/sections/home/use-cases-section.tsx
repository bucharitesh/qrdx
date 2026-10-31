import { Card } from "@repo/design-system/components/ui/card";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { SpotlightCard } from "@/components/fx/spotlight-card";
import { MockupImage } from "@/components/mockups/mockup-image";
import { PRESSABLE } from "@/components/mockups/motion";
import { Reveal } from "@/components/mockups/reveal";
import { useCaseImages, type Visual } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";

interface UseCase {
  title: string;
  description: string;
  href: string;
  linkText: string;
  image: Visual;
}

const useCases: UseCase[] = [
  {
    title: "Menus and tables",
    description: "Link a table tent or counter card to your online menu.",
    href: "/qr-code-generator/url",
    linkText: "URL QR code",
    image: useCaseImages.cafeTableTent,
  },
  {
    title: "Business cards",
    description: "Save your name, number and email to a phone in one scan.",
    href: "/qr-code-generator/vcard",
    linkText: "vCard QR code",
    image: useCaseImages.businessCard,
  },
  {
    title: "Guest Wi-Fi",
    description: "Let guests join the network without typing the password.",
    href: "/qr-code-generator/wifi",
    linkText: "Wi-Fi QR code",
    image: useCaseImages.hotelWifi,
  },
  {
    title: "Payments",
    description: "Take UPI payments at a stall, shop counter or delivery.",
    href: "/qr-code-generator/upi",
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
    href: "/qr-code-generator/attendance",
    linkText: "Attendance QR code",
    image: useCaseImages.eventCheckIn,
  },
  {
    title: "Shelves and displays",
    description: "Send shoppers from a shelf tag to your product listing.",
    href: "/qr-code-generator/amazon",
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
          From café tables to bus stops, pick the generator that writes the
          right content for the job.
        </p>
      </SectionHeader>
      <ul className="grid w-full gap-4 px-6 py-12 sm:grid-cols-2 md:px-10 md:py-16 lg:grid-cols-4">
        {useCases.map((useCase, index) => (
          <li key={useCase.href}>
            <Reveal delay={(index % 4) * 60} className="h-full">
              <Link
                href={useCase.href}
                className={`group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${PRESSABLE}`}
              >
                <SpotlightCard asChild>
                  <Card className="h-full gap-0 py-0 transition-[border-color,box-shadow] duration-200 group-hover:border-foreground/15 group-hover:shadow-md">
                    <div className="p-1.5 pb-0">
                      <div className="aspect-[4/3] overflow-hidden rounded-[20px] bg-muted">
                        <MockupImage
                          {...useCase.image}
                          bare
                          sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
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
                        {useCase.linkText}
                        <span className="grid size-7 place-items-center rounded-full border bg-background text-muted-foreground transition-[color,transform,border-color] duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover:translate-x-0.5 group-hover:border-foreground/20 group-hover:text-foreground">
                          <ArrowRight className="size-3.5" />
                        </span>
                      </span>
                    </div>
                  </Card>
                </SpotlightCard>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
