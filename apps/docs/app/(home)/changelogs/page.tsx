import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { SectionHeader } from "@/components/sections/section-header";
import { changelogSource } from "@/lib/source";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Latest updates and improvements to our product",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const Page = async () => {
  const allPages = changelogSource.getPages();

  // Sort by date, newest first
  const sortedChangelogs = allPages.sort((a, b) => {
    const dateA = new Date(a.data.date).getTime();
    const dateB = new Date(b.data.date).getTime();
    return dateB - dateA;
  });

  return (
    <>
      <section className="flex flex-col items-center justify-center w-full min-h-screen">
        <div className="w-full">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
              Changelog
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Latest updates and improvements to our product
            </p>
          </SectionHeader>

          <div className="max-w-6xl mx-auto px-6 md:px-10 py-16">
            <div className="relative">
              {sortedChangelogs.map((changelog, index) => {
                const MDX = changelog.data.body;
                const date = new Date(changelog.data.date);
                const formattedDate = formatDate(date);
                const isLast = index === sortedChangelogs.length - 1;

                return (
                  <div key={changelog.url} className="relative">
                    <div className="flex flex-col md:flex-row gap-y-6 md:gap-x-12">
                      {/* Left side - Date & Version */}
                      <div className="md:w-48 shrink-0">
                        <div className="md:sticky md:top-24">
                          <time className="text-sm font-medium text-muted-foreground block mb-3">
                            {formattedDate}
                          </time>

                          {changelog.data.version && (
                            <Badge variant="default" className="w-fit">
                              {changelog.data.version}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Right side - Content */}
                      <div className="flex-1 relative pb-16 md:pb-20">
                        {/* Vertical timeline line */}
                        {!isLast && (
                          <div className="hidden md:block absolute top-8 -left-6 w-px h-full bg-border" />
                        )}

                        {/* Timeline dot */}
                        <div className="hidden md:block absolute top-2 -left-6 -translate-x-1/2 size-3 bg-primary rounded-full border-4 border-background z-10" />

                        <div className="space-y-6 border border-border rounded-2xl p-6 md:p-8 bg-card/30 backdrop-blur-sm">
                          <div className="relative z-10 flex flex-col gap-3">
                            <h2 className="text-2xl font-semibold tracking-tight text-balance">
                              {changelog.data.title}
                            </h2>

                            {/* Tags */}
                            {changelog.data.tags &&
                              changelog.data.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {changelog.data.tags.map((tag: string) => (
                                    <span
                                      key={tag}
                                      className="h-7 w-fit px-3 text-xs font-medium bg-muted text-muted-foreground rounded-full border flex items-center justify-center"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </div>

                          <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-8 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-balance prose-p:tracking-tight prose-p:text-balance prose-a:font-medium prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4 prose-pre:bg-background prose-pre:border prose-code:text-sm prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-code:bg-muted/50 prose-code:before:content-none prose-code:after:content-none prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-muted-foreground">
                            <MDX />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Page;
