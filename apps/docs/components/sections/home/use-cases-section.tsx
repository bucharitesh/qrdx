import { ArrowRight } from "lucide-react";
import Link from "next/link";
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
      <SectionHeader>
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
      <ul className="grid w-full gap-4 px-6 py-10 sm:grid-cols-2 md:px-10 lg:grid-cols-4">
        {useCases.map((useCase, index) => (
          <li key={useCase.href}>
            <Reveal delay={(index % 4) * 60} className="h-full">
              <Link
                href={useCase.href}
                className={`group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-accent/50 hover:bg-accent hover:shadow-md hover:shadow-black/5 ${PRESSABLE}`}
              >
                <div className="aspect-[4/3] overflow-hidden border-b border-border bg-muted">
                  <MockupImage
                    {...useCase.image}
                    bare
                    sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
                    className="h-full object-cover transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <h3 className="font-semibold text-secondary-foreground">
                    {useCase.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {useCase.description}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-secondary-foreground">
                    {useCase.linkText}
                    <ArrowRight className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
