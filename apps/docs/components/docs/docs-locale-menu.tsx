"use client";

import { Tick } from "@repo/design-system/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { ArrowDown2, Global } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { remember } from "@/components/i18n/locale-switcher";
import { LOCALE_INFO } from "@/lib/i18n/config";
import { DOCS_LOCALES, englishDocsPath } from "@/lib/i18n/docs";
import { localizePath } from "@/lib/i18n/paths";

/**
 * The docs' language menu, in the sidebar footer: English and each language
 * with docs, as plain links to this page in that language. Like the site's
 * footer menu it never redirects; it only remembers the choice.
 */
export function DocsLocaleMenu() {
  const locale = useLocale();
  const t = useTranslations("docs.client.language");
  const path = englishDocsPath(usePathname() ?? "/docs");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="group inline-flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border bg-fd-secondary/50 px-2.5 text-sm text-fd-muted-foreground outline-none transition-colors hover:text-fd-foreground focus-visible:ring-2 focus-visible:ring-fd-ring data-[state=open]:text-fd-foreground">
        <Global aria-hidden className="size-4 shrink-0" />
        <span className="sr-only">{t("label")}: </span>
        <span lang={locale}>{LOCALE_INFO[locale].name}</span>
        <ArrowDown2
          aria-hidden
          className="ms-auto size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" side="top">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("label")}
        </DropdownMenuLabel>
        <p className="px-2 pb-1.5 text-xs text-pretty text-muted-foreground">
          {t("note")}
        </p>
        <DropdownMenuSeparator />
        {DOCS_LOCALES.map((option) => {
          const current = option === locale;
          return (
            <DropdownMenuItem asChild key={option}>
              <a
                aria-current={current ? "true" : undefined}
                className="flex cursor-pointer items-center justify-between gap-4"
                href={localizePath(path, option)}
                hrefLang={LOCALE_INFO[option].hreflang[0]}
                lang={option}
                onClick={() => remember(option)}
              >
                {LOCALE_INFO[option].name}
                {current && <Tick aria-hidden className="size-4" />}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
