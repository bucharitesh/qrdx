"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { Home2, RefreshCircle } from "iconsax-reactjs";
import Link from "next/link";
import { useEffect } from "react";
import { AsciiField } from "@/components/fx/ascii-field";
import { AsciiQr } from "@/components/fx/ascii-qr";
import { EGG_QR } from "@/components/fx/qr-matrix";
import { siteConfig } from "@/config/site";

/** Route error boundary: anything a page throws lands here instead of a blank screen. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative isolate flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-6 py-16">
      <AsciiField
        variant="noise"
        className="-z-10 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,transparent_30%,black_65%,transparent_100%)]"
      />
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <div className="rounded-[22px] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_24px_48px_-24px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
              <AsciiQr code={EGG_QR.oops} cell={6} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">Go on, scan it</TooltipContent>
        </Tooltip>
        <div className="flex flex-col items-center gap-3">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Error
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Something went wrong
          </h1>
          <p className="text-pretty text-muted-foreground">
            This page hit an error on our side. Try again, and if it keeps
            happening, email{" "}
            <a
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
              href={`mailto:${siteConfig.links.email}`}
            >
              {siteConfig.links.email}
            </a>
            .
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button onClick={reset} type="button">
            <RefreshCircle className="size-4" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home2 className="size-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
