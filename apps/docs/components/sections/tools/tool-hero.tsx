import type { ReactNode } from "react";
import { AsciiField, type AsciiVariant, Backdrop } from "@/components/fx";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { breadcrumbSchema, type Crumb, JsonLd } from "./json-ld";

interface ToolHeroProps {
  /** Full trail including the current page (last item, not linked). */
  crumbs: Crumb[];
  title: string;
  intro: string[];
  /** ASCII backdrop (see .claude/build/BACKDROPS.md). Default "topo". */
  pattern?: AsciiVariant;
  /** Focal point for "halo" and "ramp", as fractions [x, y]. */
  focus?: readonly [number, number];
  children?: ReactNode;
}

/** A stable small number per page, so seeded patterns differ per tool. */
function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0) % 97;
}

export function ToolHero({
  crumbs,
  title,
  intro,
  pattern = "topo",
  focus,
  children,
}: ToolHeroProps) {
  return (
    <section className="w-full relative">
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full [background:radial-gradient(120%_100%_at_50%_0%,transparent_50%,color-mix(in_oklab,var(--foreground)_6%,transparent)_100%)]"
      />
      <Backdrop className="-z-10 bottom-auto h-[min(100%,54rem)]">
        <AsciiField
          variant={pattern}
          seed={seedOf(title)}
          focus={focus}
          className="[mask-image:radial-gradient(ellipse_72%_78%_at_50%_42%,rgba(0,0,0,0.32)_15%,black_50%,transparent_80%)]"
        />
      </Backdrop>
      <div className="relative z-10 pt-28 pb-14 md:pb-16 px-6 md:px-10 mx-auto flex flex-col items-center gap-5">
        <div className="max-w-3xl flex flex-col items-center gap-5">
          <Breadcrumbs items={crumbs} />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
            {title}
          </h1>
          <div className="flex flex-col gap-3">
            {intro.map((paragraph) => (
              <p
                key={paragraph}
                className="text-base text-center text-muted-foreground text-pretty leading-relaxed"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        {children && (
          <div className="flex w-full max-w-4xl flex-col items-center gap-5">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
