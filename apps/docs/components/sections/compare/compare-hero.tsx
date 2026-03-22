import { FlickeringGrid } from "@repo/design-system/components/flickering-grid";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CompareHeroLogos } from "@/components/sections/compare/compare-hero-logos";

interface CompareHeroProps {
  competitor: string;
  tagline: string;
  competitorLogo: string;
}

export function CompareHero({
  competitor,
  tagline,
  competitorLogo,
}: CompareHeroProps) {
  return (
    <section className="w-full relative">
      <div className="absolute inset-0 -z-10 h-full w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--primary)_100%)] rounded-b-xl" />
      <div className="relative flex flex-col items-center w-full px-6">
        <div className="relative z-10 pt-32 pb-20 w-full h-full flex flex-col gap-8 items-center justify-center">
          <div className="relative hidden h-[242px] w-full overflow-hidden md:block">
            <div className="mx-auto h-full">
              <svg
                aria-label="QRdx vs {competitor} comparison"
                width="562"
                height="242"
                viewBox="0 0 562 242"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="size-full -translate-x-[3px]"
              >
                <path
                  d="M1 1H232.586C237.636 1 242.146 4.16226 243.868 8.91041L284.5 121L243.868 233.09C242.146 237.838 237.636 241 232.586 241H1V1Z"
                  fill="url(#_R_a5bsnpfliivb_-a)"
                  stroke="url(#_R_a5bsnpfliivb_-b)"
                ></path>
                <path
                  d="M318.412 9.50797C319.949 4.45422 324.61 1 329.893 1H561V241H329.893C324.61 241 319.949 237.546 318.412 232.492L284.5 121L318.412 9.50797Z"
                  fill="url(#_R_a5bsnpfliivb_-c)"
                  stroke="url(#_R_a5bsnpfliivb_-d)"
                ></path>
                <defs>
                  <linearGradient
                    id="_R_a5bsnpfliivb_-a"
                    x1="241"
                    y1="121"
                    x2="1"
                    y2="121"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="var(--secondary)"></stop>
                    <stop
                      offset="1"
                      stopColor="var(--secondary)"
                      stopOpacity="0"
                    ></stop>
                  </linearGradient>
                  <linearGradient
                    id="_R_a5bsnpfliivb_-b"
                    x1="241"
                    y1="121"
                    x2="1"
                    y2="121"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="var(--secondary)"></stop>
                    <stop
                      offset="1"
                      stopColor="var(--secondary)"
                      stopOpacity="0"
                    ></stop>
                  </linearGradient>
                  <linearGradient
                    id="_R_a5bsnpfliivb_-c"
                    x1="321"
                    y1="121"
                    x2="561"
                    y2="121"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="var(--secondary)"></stop>
                    <stop
                      offset="1"
                      stopColor="var(--secondary)"
                      stopOpacity="0"
                    ></stop>
                  </linearGradient>
                  <linearGradient
                    id="_R_a5bsnpfliivb_-d"
                    x1="321"
                    y1="121"
                    x2="561"
                    y2="121"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="var(--secondary)"></stop>
                    <stop
                      offset="1"
                      stopColor="var(--secondary)"
                      stopOpacity="0"
                    ></stop>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div
              className="absolute inset-y-0 left-1/2 flex w-full max-w-5xl -translate-x-1/2 justify-between"
              style={{ opacity: 1 }}
            >
              <div
                className="h-full w-[300px]"
                style={{
                  maskImage:
                    "linear-gradient(to left, transparent 0%, black 25%, black 60%, transparent 100%)",
                }}
              >
                <FlickeringGrid
                  flickerChance={0.1}
                  maxOpacity={0.6}
                  squareSize={2}
                  color="oklch(0.38 0.22 262.8657)"
                />
              </div>
              <div
                className="h-full w-[300px]"
                style={{
                  maskImage:
                    "linear-gradient(to right, transparent 0%, black 25%, black 60%, transparent 100%)",
                }}
              >
                <FlickeringGrid
                  flickerChance={0.1}
                  maxOpacity={0.6}
                  squareSize={2}
                  color="oklch(0.38 0.22 262.8657)"
                />
              </div>
            </div>
            <CompareHeroLogos
              competitor={competitor}
              competitorLogo={competitorLogo}
            />
          </div>

          <div className="flex flex-col items-center justify-center gap-5">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
              QRdx vs {competitor}
            </h1>
            <p className="text-base md:text-lg text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight max-w-xl">
              {tagline}
            </p>
          </div>

          <div className="flex items-center flex-wrap justify-center">
            <Link href="/playground">
              <Button>
                Try the Playground
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
