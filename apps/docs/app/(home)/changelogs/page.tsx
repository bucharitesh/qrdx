import { cn } from "@repo/design-system/lib/utils";
import {
  ArrangeHorizontal,
  Code1,
  Driver,
  Flag,
  Flash,
  Gallery,
  Link21,
  People,
  Routing2,
  ShieldTick,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import { AsciiField } from "@/components/fx";
import { IconTile } from "@/components/sections/tools/cards";
import { createMetadata } from "@/lib/metadata";
import { changelogSource } from "@/lib/source";

export const metadata: Metadata = createMetadata({
  title: "Changelog",
  description:
    "Release notes for QRdx: dynamic QR codes, hosted pages, integrations, library and CLI updates, and fixes.",
  path: "/changelogs",
});

/** Entry icon, picked from its first tag that has one. */
const TAG_ICONS = {
  Launch: Flag,
  "Dynamic codes": Routing2,
  Community: People,
  Integrations: Link21,
  CLI: Code1,
  Developers: Code1,
  Performance: Flash,
  Security: ShieldTick,
  "Self-hosting": Driver,
  "Art QR": Gallery,
  Feature: Flash,
  UI: ArrangeHorizontal,
} as const;

function entryIcon(tags: string[] | undefined) {
  for (const tag of tags ?? []) {
    if (tag in TAG_ICONS) return TAG_ICONS[tag as keyof typeof TAG_ICONS];
  }
  return Flag;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "0.1.0" > "0.0.6", for entries released on the same day. */
function compareVersions(a = "0", b = "0"): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

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

const Page = () => {
  const entries = [...changelogSource.getPages()].sort(
    (a, b) =>
      new Date(b.data.date).getTime() - new Date(a.data.date).getTime() ||
      compareVersions(b.data.version, a.data.version),
  );

  return (
    <main className="flex w-full min-h-screen flex-col">
      <header className="relative w-full overflow-hidden border-b px-6 py-14 md:px-10 md:py-20">
        <AsciiField
          variant="wave"
          density={0.9}
          className="[mask-image:radial-gradient(ellipse_75%_95%_at_50%_50%,rgba(0,0,0,0.3)_20%,black_55%,transparent_88%)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Release notes
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Changelog
          </h1>
          <p className="text-muted-foreground text-pretty">
            New features, improvements and fixes in QRdx, newest first.
          </p>
        </div>
      </header>

      <ol className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-16">
        {entries.map((entry, index) => {
          const MDX = entry.data.body;
          const Icon = entryIcon(entry.data.tags);
          const isLast = index === entries.length - 1;

          return (
            <li
              key={entry.url}
              className="grid min-w-0 gap-3 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-0"
            >
              <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-2 md:pt-1 md:pr-8">
                <div className="flex items-center gap-2 md:sticky md:top-24 md:flex-col md:items-start">
                  <time
                    dateTime={entry.data.date}
                    className="text-sm font-medium text-foreground"
                  >
                    {formatDate(entry.data.date)}
                  </time>
                  {entry.data.version && (
                    <span className="rounded-full border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      v{entry.data.version}
                    </span>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "relative min-w-0 pb-10 md:border-l md:pb-16 md:pl-8",
                  isLast && "pb-0 md:pb-0",
                )}
              >
                <span
                  aria-hidden
                  className="absolute top-2.5 -left-[4.5px] hidden size-2 rounded-full bg-foreground/40 ring-4 ring-background md:block"
                />
                <article className="min-w-0 overflow-hidden rounded-xl border bg-card p-5 shadow-sm sm:p-6 md:p-8">
                  <div className="flex items-start gap-3.5">
                    <IconTile icon={Icon} />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <h2 className="text-xl font-semibold tracking-tight text-balance md:text-2xl">
                        {entry.data.title}
                      </h2>
                      {entry.data.description && (
                        <p className="text-muted-foreground text-pretty">
                          {entry.data.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {entry.data.tags && entry.data.tags.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {entry.data.tags.map((tag: string) => (
                        <li
                          key={tag}
                          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="my-6 h-px bg-border" />
                  <div className={proseClass}>
                    <MDX
                      components={{
                        h2: (props) => <h3 {...props} />,
                        h3: (props) => <h4 {...props} />,
                      }}
                    />
                  </div>
                </article>
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
};

export default Page;
