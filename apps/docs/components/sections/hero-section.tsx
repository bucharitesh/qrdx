import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { AsciiField, Aurora, Backdrop } from "@/components/fx";
import { HeroEditor } from "@/components/sections/home/hero-editor";
import { HeroScene } from "@/components/sections/home/hero-scene";
import { siteConfig } from "@/config/site";

export function HeroSection() {
  const { hero } = siteConfig;

  return (
    <section id="hero" className="relative w-full">
      <div className="relative overflow-hidden pt-20 pb-14 md:pt-28 md:pb-20">
        <Backdrop className="bottom-auto h-[52rem]">
          <Aurora />
          <AsciiField
            variant="scan"
            density={0.9}
            className="[mask-image:radial-gradient(ellipse_46%_34%_at_50%_46%,rgba(0,0,0,0.28)_55%,black_100%),radial-gradient(ellipse_80%_70%_at_50%_38%,black_45%,transparent_85%)] [mask-composite:intersect]"
          />
        </Backdrop>
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-6 text-center md:gap-8">
          <p className="flex h-8 items-center gap-2 rounded-full border bg-background/80 px-3 text-sm text-muted-foreground backdrop-blur">
            {hero.badgeIcon}
            {hero.badge}
          </p>
          <div className="flex flex-col items-center gap-5">
            <h1 className="text-balance text-4xl font-semibold tracking-tighter text-foreground md:text-5xl xl:text-6xl">
              {hero.title}
            </h1>
            <p className="max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
              {hero.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button asChild>
              <Link href={hero.cta.primary.href}>
                {hero.cta.primary.text}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={hero.cta.secondary.href}>
                {hero.cta.secondary.text}
              </Link>
            </Button>
          </div>
        </div>
        <HeroScene className="relative left-1/2 mt-6 w-[150%] max-w-none -translate-x-1/2 sm:w-full sm:max-w-6xl sm:px-2 md:mt-4" />
        <div className="relative mx-auto mt-4 w-full max-w-5xl px-6 md:mt-6 md:px-10">
          <HeroEditor />
        </div>
      </div>
    </section>
  );
}
