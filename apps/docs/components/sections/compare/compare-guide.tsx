import { SectionHeader } from "@/components/sections/section-header";

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
    <section className="flex flex-col items-center justify-center w-full">
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          QRdx or {competitor}: which should you use?
        </h2>
      </SectionHeader>

      <div className="w-full max-w-3xl mx-auto px-6 py-10">
        <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary">
          {children}
        </div>

        {sources.length > 0 && (
          <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6">
            <h3 className="text-sm font-semibold text-secondary-foreground">
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
                <li key={url} className="text-sm break-all">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-muted-foreground underline-offset-4 hover:text-secondary-foreground hover:underline"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
