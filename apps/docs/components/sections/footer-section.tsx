"use client";

import { GithubLogo } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2 } from "iconsax-reactjs";
import Link from "next/link";
import { useId, useState } from "react";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import { EGG_QR } from "@/components/fx/qr-matrix";
import { QrMosaic } from "@/components/fx/qr-mosaic";
import { siteConfig } from "@/config/site";
import { QrdxLogo } from "../qrdx-logo";

const LINK =
  "rounded-sm text-sm/snug text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type FooterLink = { id: number; title: string; url: string };

/** A footer item that opens a nested list of links (e.g. Legal). */
function FooterDisclosure({
  title,
  links,
}: {
  title: string;
  links: readonly FooterLink[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          LINK,
          "group inline-flex w-fit items-center gap-1 text-left",
          open && "text-foreground",
        )}
      >
        {title}
        <ArrowDown2
          aria-hidden="true"
          className="size-3.5 transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] group-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </button>
      <div
        id={id}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <ul className="flex min-h-0 flex-col gap-y-2 overflow-hidden border-l border-border pt-2.5 pl-3 ml-0.5">
          {links.map((link) => (
            <li key={link.id}>
              <Link href={link.url} className={LINK}>
                {link.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function FooterSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="w-full">
      <div className="flex flex-col gap-10 px-6 pt-14 pb-10 md:px-10 lg:flex-row lg:justify-between">
        <div className="flex max-w-xs flex-col items-start gap-5">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <QrdxLogo className="size-6 text-foreground" />
            <span className="text-xl font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </Link>
          <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
            {siteConfig.description}
          </p>
          <Button asChild variant="outline">
            <Link href={siteConfig.links.github}>
              <GithubLogo className="size-4" />
              Star on GitHub
            </Link>
          </Button>
        </div>
        <nav aria-label="Footer" className="lg:flex-1 lg:pl-10">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {siteConfig.footerLinks.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <h2 className="text-xs font-medium tracking-wider text-foreground uppercase">
                  {column.title}
                </h2>
                <ul className="flex flex-col gap-y-2">
                  {column.links.map((link) =>
                    "children" in link && link.children ? (
                      <FooterDisclosure
                        key={link.id}
                        title={link.title}
                        links={link.children}
                      />
                    ) : (
                      <li key={link.id}>
                        <Link href={link.url ?? "/"} className={LINK}>
                          {link.title}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>
      <div className="relative h-56 overflow-hidden border-t md:h-72">
        <QrMosaic
          code={EGG_QR.footer}
          className="[mask-image:radial-gradient(ellipse_52%_70%_at_50%_50%,black_35%,transparent_100%)]"
        />
        {/* Where the code resolves on hover: (25 + 4) modules × 7 px. */}
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 size-[203px] -translate-x-1/2 -translate-y-1/2"
            />
          </TooltipTrigger>
          <TooltipContent side="top">Go on, scan it</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-1 border-t px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            © {currentYear} {siteConfig.name}. Open source under AGPL-3.0.
          </p>
          <CookieSettingsButton />
        </div>
        <a
          href="https://qrdx.dev"
          className="w-fit font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          qrdx.dev
        </a>
      </div>
    </footer>
  );
}
