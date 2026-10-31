import { Tick } from "@repo/design-system/components/icons";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";

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
    <section className="w-full px-6 py-14 md:py-16">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          Why choose QRdx over {competitor}?
        </h2>
        <p className="text-pretty text-muted-foreground">
          The areas where QRdx is the stronger pick. The guide below also covers
          where {competitor} is the better choice.
        </p>
      </div>

      <ul
        className={cn(
          "mx-auto mt-10 grid max-w-4xl gap-4",
          highlights.length % 2 === 0 && "md:grid-cols-2",
        )}
      >
        {highlights.map((highlight) => (
          <li key={highlight.title}>
            <Card className="h-full flex-row items-start gap-4 p-6 shadow-xs">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40">
                <Tick
                  aria-hidden
                  className="size-4 text-foreground/80"
                  strokeWidth={2}
                />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-semibold tracking-tight">
                  {highlight.title}
                </h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {highlight.description}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
