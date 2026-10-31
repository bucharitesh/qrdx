import { Card } from "@repo/design-system/components/ui/card";
import { DocumentText } from "iconsax-reactjs";

interface CompareGuideProps {
  competitor: string;
  sources: string[];
  lastVerified?: string;
  children: React.ReactNode;
}

function formatVerified(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CompareGuide({
  competitor,
  sources,
  lastVerified,
  children,
}: CompareGuideProps) {
  return (
    <section className="w-full px-6 py-14 md:py-16">
      <h2 className="mx-auto max-w-2xl text-center text-2xl font-semibold tracking-tight text-balance md:text-3xl">
        QRdx or {competitor}: which should you use?
      </h2>

      <div className="mx-auto mt-10 w-full max-w-3xl">
        <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:font-medium prose-a:text-foreground prose-a:decoration-foreground/30 prose-a:underline-offset-4 hover:prose-a:decoration-foreground">
          {children}
        </div>

        {sources.length > 0 && (
          <Card className="mt-10 flex-row items-start gap-4 bg-muted/40 p-5 shadow-none dark:bg-card">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-background">
              <DocumentText aria-hidden className="size-4 text-foreground/80" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">
                Sources
                {lastVerified
                  ? ` (verified ${formatVerified(lastVerified)})`
                  : ""}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Competitor prices and limits change often. Check their pages
                before you decide.
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {sources.map((url) => (
                  <li className="text-sm break-all" key={url}>
                    <a
                      className="text-muted-foreground underline decoration-foreground/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                      href={url}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
