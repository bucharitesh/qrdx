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
import { ChangelogBody } from "@/components/changelog/changelog-body";
import { ChangelogPicture } from "@/components/changelog/changelog-picture";
import { AsciiField } from "@/components/fx";
import { NpmLagNotice } from "@/components/mdx/npm-status";
import { IconTile } from "@/components/sections/tools/cards";
import { changelogAnchor } from "@/lib/changelog-feed";
import { changelogPictureUrl } from "@/lib/changelog-feed-server";
import { createMetadata } from "@/lib/metadata";
import { getNpmLag, type NpmLag } from "@/lib/npm-version";
import { changelogEntries } from "./entries";

export const metadata: Metadata = createMetadata({
  title: "Changelog",
  description:
    "Release notes for QRdx: dynamic QR codes, hosted pages, integrations, library and CLI updates, and fixes.",
  path: "/changelogs",
  ownOgImage: true,
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

const Page = async () => {
  const entries = changelogEntries();

  // An entry that releases npm packages says "Coming to npm" until npm has
  // them (checked hourly; nothing is claimed when npm can't be reached).
  const npmLags = new Map<string, NpmLag[]>(
    await Promise.all(
      entries.map(async (entry) => {
        const lags = await Promise.all(
          (entry.data.npm ?? []).map(({ name, version }) =>
            getNpmLag(name, version),
          ),
        );
        return [
          entry.url,
          lags.filter((lag): lag is NpmLag => lag !== null),
        ] as const;
      }),
    ),
  );

  return (
    <main className="flex w-full min-h-screen flex-col">
      <header className="relative w-full overflow-hidden border-b px-10 py-14 md:py-20">
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

      <ol className="mx-auto w-full max-w-5xl px-10 py-10 md:py-16">
        {entries.map((entry, index) => {
          const Icon = entryIcon(entry.data.tags);
          const isLast = index === entries.length - 1;
          const lags = npmLags.get(entry.url) ?? [];

          return (
            <li
              key={entry.url}
              // The app's "What's new" links here (/changelogs#<slug>).
              id={changelogAnchor(entry.slugs)}
              className="grid min-w-0 scroll-mt-24 gap-3 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-0"
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
                  {lags.length > 0 && (
                    <span className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
                      Coming to npm
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
                  {entry.data.image && (
                    <div className="relative -mx-5 -mt-5 mb-6 aspect-video overflow-hidden border-b bg-muted sm:-mx-6 sm:-mt-6 md:-mx-8 md:-mt-8 md:mb-8">
                      <ChangelogPicture
                        alt={entry.data.imageAlt ?? ""}
                        darkSrc={
                          entry.data.imageDark &&
                          changelogPictureUrl(entry.data.imageDark)
                        }
                        sizes="(min-width: 1024px) 784px, 100vw"
                        src={changelogPictureUrl(entry.data.image)}
                      />
                    </div>
                  )}
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
                  <NpmLagNotice lags={lags} />
                  <ChangelogBody entry={entry} />
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
