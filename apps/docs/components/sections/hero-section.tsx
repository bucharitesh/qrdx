import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { HeroEditor } from "@/components/sections/home/hero-editor";
import { siteConfig } from "@/config/site";

export function HeroSection() {
  const { hero } = siteConfig;

  return (
    <section id="hero" className="w-full relative">
      <div className="absolute inset-0 -z-10 h-[600px] md:h-[800px] w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--primary)_100%)] rounded-b-xl"></div>
      <div className="relative flex flex-col items-center w-full px-6">
        <div className="relative z-10 pt-32 max-w-3xl mx-auto h-full w-full flex flex-col gap-10 items-center justify-center">
          <p className="border border-border bg-muted rounded-full text-sm h-8 px-3 flex items-center gap-2">
            {hero.badgeIcon}
            {hero.badge}
          </p>
          <div className="flex flex-col items-center justify-center gap-5">
            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
              {hero.title}
            </h1>
            <p className="text-base md:text-lg text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight">
              {hero.description}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap justify-center">
            <Link href={hero.cta.primary.href}>
              <Button>{hero.cta.primary.text}</Button>
            </Link>
            <Link href={hero.cta.secondary.href}>
              <Button variant="outline">{hero.cta.secondary.text}</Button>
            </Link>
          </div>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-5xl px-6 pt-10 pb-12 md:px-10 md:pt-14 md:pb-16">
        <HeroEditor />
      </div>
    </section>
  );
}
