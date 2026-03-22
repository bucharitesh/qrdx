import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { QrdxLogo } from "@/components/qrdx-logo";
import { SectionHeader } from "@/components/sections/section-header";
import { compareSource } from "@/lib/source";

interface CompareOthersProps {
  currentSlug: string;
}

export function CompareOthers({ currentSlug }: CompareOthersProps) {
  const allPages = compareSource.getPages();
  const others = allPages.filter((p) => (p.slugs[0] ?? "") !== currentSlug);

  if (others.length === 0) return null;

  return (
    <section className="flex flex-col items-center justify-center w-full">
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          QRdx vs. others
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          See how QRdx compares to every major QR code platform — free, open
          source, and developer-first.
        </p>
      </SectionHeader>

      <div className="w-full px-10 py-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {others.map((page) => {
            const slug = page.slugs[0] ?? "";
            const { competitor, competitorLogo } = page.data;

            return (
              <Link
                key={slug}
                href={`/compare/${slug}`}
                className="group rounded-xl border border-border bg-accent/50 hover:bg-accent transition-colors overflow-hidden flex flex-col"
              >
                <div className="flex items-center gap-1.5 px-5 pt-5 pb-3">
                  <span className="text-base font-bold text-secondary-foreground">
                    Compare with {competitor}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>

                <div className="relative flex items-end justify-center px-5 pb-5 pt-2 h-36">
                  <QrdxLogo className="size-30 absolute opacity-10 -bottom-10 -left-10" />
                  <div className="absolute bottom-4 right-8 size-20 flex items-center justify-center p-1.5">
                    <img
                      src={competitorLogo}
                      alt={`${competitor} logo`}
                      className="size-full object-contain"
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
