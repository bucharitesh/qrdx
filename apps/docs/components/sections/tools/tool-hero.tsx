import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/sections/breadcrumbs";
import { breadcrumbSchema, type Crumb, JsonLd } from "./json-ld";

interface ToolHeroProps {
  /** Full trail including the current page (last item, not linked). */
  crumbs: Crumb[];
  title: string;
  intro: string[];
  children?: ReactNode;
}

export function ToolHero({ crumbs, title, intro, children }: ToolHeroProps) {
  return (
    <section className="w-full relative">
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <div className="absolute inset-0 -z-10 h-full w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--primary)_100%)] rounded-b-xl" />
      <div className="relative z-10 pt-28 pb-14 md:pb-16 px-6 md:px-10 max-w-3xl mx-auto flex flex-col items-center gap-5">
        <Breadcrumbs items={crumbs} />
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-balance text-center text-secondary-foreground">
          {title}
        </h1>
        <div className="flex flex-col gap-3">
          {intro.map((paragraph) => (
            <p
              key={paragraph}
              className="text-base text-center text-muted-foreground font-medium text-pretty leading-relaxed tracking-tight"
            >
              {paragraph}
            </p>
          ))}
        </div>
        {children}
      </div>
    </section>
  );
}
