import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight, Book1, Home2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { AsciiField } from "@/components/fx/ascii-field";
import { NotFoundCode } from "@/components/not-found-code";
import { TrackOnMount } from "@/lib/analytics/react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-6 py-16">
      <TrackOnMount event="404_viewed" props={{ area: "site" }} />
      <AsciiField
        variant="noise"
        className="-z-10 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_50%,transparent_28%,black_62%,transparent_100%)]"
      />
      <div className="flex flex-col items-center gap-8 text-center">
        <NotFoundCode />
        <div className="flex max-w-md flex-col items-center gap-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tighter md:text-4xl">
            This page could not be found
          </h1>
          <p className="text-pretty text-muted-foreground">
            The link may be broken or the page moved. Scan the code. Or pick a
            way back below.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <Link href="/">
              <Home2 className="size-4" />
              Go home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/playground">
              Open the playground
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/docs">
              <Book1 className="size-4" />
              Docs
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
