/** biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative badge icon */
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AsciiField, Aurora, Backdrop } from "@/components/fx";
import { LocaleLink } from "@/components/i18n/locale-link";
import { HeroEditor } from "@/components/sections/home/hero-editor";
import { HeroScene } from "@/components/sections/home/hero-scene";
import { playgroundHref } from "@/lib/playground-links";

function BadgeIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="dark:fill-white fill-[#364153]"
    >
      <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm9.5 0h2v2h-2V9zm0 3h2v2h-2v-2zm-2-3h2v2h-2V9zm0 3h2v2h-2v-2z" />
    </svg>
  );
}

export function HeroSection() {
  const t = useTranslations("home.hero");

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
        <div className="relative mx-auto flex w-full max-w-[50rem] flex-col items-center gap-7 px-10 text-center md:gap-8">
          <p className="flex min-h-8 items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-balance text-sm text-muted-foreground backdrop-blur">
            <BadgeIcon />
            {t("badge")}
          </p>
          <div className="flex flex-col items-center gap-5">
            <h1 className="text-balance text-4xl font-semibold tracking-tighter text-foreground md:text-5xl xl:text-6xl">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
              {t("description")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button asChild>
              <LocaleLink href={playgroundHref()}>
                {t("primary")}
                <ArrowRight className="size-4" />
              </LocaleLink>
            </Button>
            <Button asChild variant="outline">
              {/* Only the primary CTA prefetches: the docs bundle is large. */}
              <Link href="/docs" prefetch={false}>
                {t("secondary")}
              </Link>
            </Button>
          </div>
        </div>
        <HeroScene
          className="relative left-1/2 mt-6 w-[120%] max-w-none -translate-x-1/2 sm:w-full sm:max-w-6xl sm:px-2 md:mt-4"
          label={t("sceneLabel")}
        />
        <div className="relative mx-auto mt-4 w-full max-w-5xl px-10 md:mt-6">
          <HeroEditor />
        </div>
      </div>
    </section>
  );
}
