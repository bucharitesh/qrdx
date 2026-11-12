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
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useAvailability } from "@/components/availability-provider";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import { EGG_QR } from "@/components/fx/qr-matrix";
import { QrMosaic } from "@/components/fx/qr-mosaic";
import { LocaleLink, useLocalizeHref } from "@/components/i18n/locale-link";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { type FooterLinkConfig, siteConfig } from "@/config/site";
import { QrdxLogo } from "../qrdx-logo";

const LINK =
  "rounded-sm text-sm/snug text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A footer link's text: its translation, or a name that stays as is. */
function useLinkText() {
  const t = useTranslations("footer.links");
  return (link: FooterLinkConfig) => (link.key ? t(link.key) : link.label);
}

/** A footer item that opens a nested list of links (e.g. Legal). */
function FooterDisclosure({
  title,
  links,
}: {
  title: string;
  links: readonly FooterLinkConfig[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = useLinkText();

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
              <LocaleLink href={link.url} className={LINK} prefetch={false}>
                {text(link)}
              </LocaleLink>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function FooterSection() {
  const t = useTranslations("footer");
  const text = useLinkText();
  const currentYear = new Date().getFullYear();
  // No links to pages for features this deployment can't offer.
  const { showsPath } = useAvailability();
  // The official site's home in this page's language (qrdx.dev/hi).
  const localizeHref = useLocalizeHref();

  return (
    <footer id="footer" className="w-full">
      <div className="flex flex-col gap-10 px-10 pt-14 pb-10 lg:flex-row lg:justify-between">
        <div className="flex max-w-xs flex-col items-start gap-5">
          <LocaleLink
            href="/"
            className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <QrdxLogo className="size-6 text-foreground" />
            <span className="text-xl font-semibold tracking-tight">
              {siteConfig.name}
            </span>
          </LocaleLink>
          <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
            {t("description")}
          </p>
          <Button asChild variant="outline">
            <a href={siteConfig.links.github}>
              <GithubLogo className="size-4" />
              {t("starOnGithub")}
            </a>
          </Button>
        </div>
        <nav aria-label={t("navLabel")} className="lg:flex-1 lg:pl-10">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {siteConfig.footerLinks.map((column) => (
              <div key={column.key} className="flex flex-col gap-3">
                <h2 className="text-xs font-medium tracking-wider text-foreground uppercase">
                  {t(`columns.${column.key}`)}
                </h2>
                <ul className="flex flex-col gap-y-2">
                  {column.links
                    .filter(
                      (link) =>
                        !("url" in link && link.url) || showsPath(link.url),
                    )
                    .map((link) =>
                      "children" in link ? (
                        <FooterDisclosure
                          key={link.id}
                          title={t(`links.${link.key}`)}
                          // The affiliate terms only where the program runs.
                          links={link.children.filter((child) =>
                            showsPath(child.url),
                          )}
                        />
                      ) : (
                        <li key={link.id}>
                          <LocaleLink
                            href={link.url}
                            className={LINK}
                            prefetch={false}
                          >
                            {text(link)}
                          </LocaleLink>
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
          <TooltipContent side="top">{t("scanIt")}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-col gap-3 border-t px-10 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            {t("copyright", { year: String(currentYear) })}
          </p>
          <CookieSettingsButton />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LocaleSwitcher />
          <a
            href={`https://qrdx.dev${localizeHref("/") === "/" ? "" : localizeHref("/")}`}
            className="w-fit font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            qrdx.dev
          </a>
        </div>
      </div>
    </footer>
  );
}
