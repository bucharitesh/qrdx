import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { changelogAnchor } from "@/lib/changelog-feed";
import { changelogSource } from "@/lib/content-source";

type ChangelogPage = ReturnType<typeof changelogSource.getPages>[number];

const proseClass = cn(
  "prose prose-neutral dark:prose-invert max-w-none min-w-0 text-[15px] leading-relaxed",
  "prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
  "prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-base first:prose-h3:mt-0 prose-h4:text-sm",
  "prose-p:text-muted-foreground prose-p:text-pretty prose-li:text-muted-foreground prose-li:my-1 prose-li:marker:text-foreground/30 prose-ul:my-3",
  "prose-strong:font-medium prose-strong:text-foreground",
  "prose-a:font-medium prose-a:text-foreground prose-a:underline prose-a:decoration-foreground/30 prose-a:underline-offset-4 hover:prose-a:decoration-foreground",
  "prose-code:rounded-md prose-code:border prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:bg-muted/40 prose-pre:text-foreground [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "prose-hr:my-6 prose-hr:border-border",
);

/**
 * An entry's release notes, as /changelogs shows them (its headings one
 * level down, under the entry's own title). Also rendered on the server
 * for the app's "What's new" modal.
 */
export function ChangelogBody({
  entry,
  className,
}: {
  entry: ChangelogPage;
  className?: string;
}) {
  const MDX = entry.data.body;
  return (
    <div className={cn(proseClass, className)}>
      <MDX
        components={{
          h2: (props) => <h3 {...props} />,
          h3: (props) => <h4 {...props} />,
        }}
      />
    </div>
  );
}

/**
 * Release notes for the given entries (slugs from lib/changelog-feed.ts),
 * rendered on the server for the app's "What's new" modal.
 */
export function changelogBodies(
  slugs: readonly string[],
  className?: string,
): Record<string, ReactNode> {
  const wanted = new Set(slugs);
  const bodies: Record<string, ReactNode> = {};
  for (const entry of changelogSource.getPages()) {
    const slug = changelogAnchor(entry.slugs);
    if (wanted.has(slug)) {
      bodies[slug] = <ChangelogBody className={className} entry={entry} />;
    }
  }
  return bodies;
}
