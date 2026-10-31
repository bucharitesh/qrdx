import Link from "fumadocs-core/link";
import { ArrowRight } from "iconsax-reactjs";
import { HairlineFigure } from "@/components/mockups/hairline";

const PLACES = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    description: "Design and download your first code.",
  },
  {
    href: "/docs/dynamic-qr-codes",
    title: "Dynamic QR codes",
    description: "Short links you can change after printing.",
  },
  {
    href: "/docs/developers/rest-api",
    title: "REST API",
    description: "Create and manage codes from your own app.",
  },
  {
    href: "/docs/components/qr-code",
    title: "Components",
    description: "React and shadcn/ui components for QR codes.",
  },
];

/** Docs 404, shown inside the docs layout so the sidebar and search stay. */
export function DocsNotFound() {
  return (
    // [grid-area:main] places it in the docs layout grid, like DocsPage does.
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center [grid-area:main]">
      <HairlineFigure className="h-32 w-44" figure="Query" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          This page isn't in the docs
        </h1>
        <p className="text-pretty text-fd-muted-foreground">
          It may have moved or been renamed. Search the docs, or start from one
          of these.
        </p>
      </div>
      <ul className="grid w-full gap-2 text-left sm:grid-cols-2">
        {PLACES.map((place) => (
          <li key={place.href}>
            <Link
              href={place.href}
              className="group flex h-full flex-col gap-0.5 rounded-xl border bg-fd-card p-4 transition-colors hover:border-fd-foreground/15 hover:bg-fd-accent/60"
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-fd-foreground">
                {place.title}
                <ArrowRight
                  aria-hidden
                  className="size-3.5 text-fd-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
              <span className="text-sm text-fd-muted-foreground">
                {place.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
