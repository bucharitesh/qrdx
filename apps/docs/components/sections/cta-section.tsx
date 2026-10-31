import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { AsciiField } from "@/components/fx/ascii-field";
import { siteConfig } from "@/config/site";

/** Closing call to action: a dark stage in both themes, with a live ASCII field. */
export function CTASection() {
  const { ctaSection } = siteConfig;

  return (
    <section id="cta" className="w-full px-4 py-4 md:px-6 md:py-6">
      <div className="relative isolate overflow-hidden rounded-xl border border-black/10 bg-neutral-950 text-white shadow-[0_24px_60px_-28px_rgba(0,0,0,0.5)] dark:border-white/10 dark:shadow-none">
        <AsciiField
          variant="wave"
          density={0.9}
          className="text-white [mask-image:radial-gradient(ellipse_65%_75%_at_50%_50%,rgba(0,0,0,0.22)_10%,black_70%,transparent_100%)]"
        />
        <div className="relative flex flex-col items-center gap-6 px-6 py-20 text-center md:gap-7 md:py-28">
          <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tighter md:text-6xl">
            Make your next QR code in seconds.
          </h2>
          <p className="text-pretty text-white/60">{ctaSection.subtext}</p>
          <Button
            asChild
            className="border-white bg-white text-neutral-950 hover:bg-white/90 dark:text-neutral-950"
          >
            <Link href={ctaSection.button.href}>
              {ctaSection.button.text}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
