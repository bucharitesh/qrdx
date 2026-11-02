// Pieces of the help center home (content/docs/help/index.mdx): a search
// box that opens the docs search, and the "Still stuck?" contact block.

import Link from "fumadocs-core/link";
import { ArrowRight, Messages2, SearchNormal1, Sms } from "iconsax-reactjs";
import { HairlineFigure } from "@/components/mockups/hairline";
import { siteConfig } from "@/config/site";
import { HelpSearchTrigger } from "./help-search-trigger";

/** Large search box: opens the same search dialog as ⌘K. */
export function HelpSearch() {
  return (
    <HelpSearchTrigger className="not-prose group flex w-full items-center gap-3 rounded-xl border bg-fd-card px-4 py-3.5 text-start text-fd-muted-foreground shadow-xs transition-colors hover:border-fd-foreground/20 hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring">
      <SearchNormal1 aria-hidden className="size-5 shrink-0" />
      <span className="flex-1 text-base">Search help and docs</span>
      <kbd className="hidden rounded-md border bg-fd-muted px-1.5 py-0.5 font-mono text-xs sm:inline">
        ⌘K
      </kbd>
    </HelpSearchTrigger>
  );
}

const githubIssues = `${siteConfig.links.github}/issues`;

/** "Still stuck?": the ways to reach a person, with the help figure. */
export function StillStuck() {
  const email = siteConfig.links.email;
  return (
    <section
      aria-labelledby="still-stuck"
      className="not-prose mt-10 grid items-center gap-6 rounded-xl border bg-fd-card p-6 sm:grid-cols-[minmax(0,1fr)_10rem]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2
            className="text-lg font-semibold tracking-tight text-fd-foreground"
            id="still-stuck"
          >
            Still stuck?
          </h2>
          <p className="text-sm text-fd-muted-foreground text-pretty">
            Tell us what you were trying to do and what happened. Include the
            code's short link if it's about a code.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5 text-sm">
          <li>
            <a
              className="inline-flex items-center gap-2 font-medium text-fd-foreground underline decoration-fd-foreground/30 underline-offset-4 hover:decoration-fd-foreground"
              href={`mailto:${email}`}
            >
              <Sms aria-hidden className="size-4 shrink-0" />
              {email}
            </a>
          </li>
          <li className="flex items-start gap-2 text-fd-muted-foreground">
            <Messages2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              The support widget on qrdx.dev, once you allow Functionality
              cookies.
            </span>
          </li>
          <li>
            <a
              className="inline-flex items-center gap-2 text-fd-muted-foreground hover:text-fd-foreground"
              href={githubIssues}
              rel="noopener"
              target="_blank"
            >
              <ArrowRight aria-hidden className="size-4 shrink-0" />
              Report a bug on GitHub
            </a>
          </li>
        </ul>
        <Link
          className="text-sm font-medium text-fd-foreground underline decoration-fd-foreground/30 underline-offset-4 hover:decoration-fd-foreground"
          href="/docs/help/contact"
        >
          All the ways to contact us
        </Link>
      </div>
      <HairlineFigure
        className="hidden aspect-[5/4] w-40 sm:block"
        figure="Question"
      />
    </section>
  );
}
