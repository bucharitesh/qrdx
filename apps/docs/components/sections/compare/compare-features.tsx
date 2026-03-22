import { Check } from "lucide-react";
import { SectionHeader } from "@/components/sections/section-header";

export interface FeatureHighlight {
  title: string;
  description: string;
}

interface CompareFeaturesProps {
  competitor: string;
  highlights: FeatureHighlight[];
}

export function CompareFeatures({
  competitor,
  highlights,
}: CompareFeaturesProps) {
  return (
    <section className="flex flex-col items-center justify-center w-full">
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          Why choose QRdx over {competitor}?
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          QRdx gives you more power and flexibility — built for developers,
          loved by everyone.
        </p>
      </SectionHeader>

      <div className="w-full max-w-4xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-4">
          {highlights.map((highlight) => (
            <div
              key={highlight.title}
              className="rounded-xl border border-border bg-card/30 p-6 flex flex-col gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Check className="size-4 text-primary" strokeWidth={2.5} />
                </div>
                <h3 className="text-base font-semibold text-secondary-foreground tracking-tight">
                  {highlight.title}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed pl-11">
                {highlight.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
