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
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, Global } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_INFO,
  LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import { isLocalizedPath, localizePath, splitLocale } from "@/lib/i18n/paths";

/** Remembers the choice for later (the signed-in app, phase 2). Never redirects. */
export function remember(locale: Locale) {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: a display preference, read on the server later
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // Blocked cookies: the link still opens the language.
  }
}

/**
 * The only way to change language (no detection, no banner): each language
 * in its own script, as a plain link to the same page in that language. On
 * a page that isn't translated yet, other languages open their home page.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("localeSwitcher");
  const { path } = splitLocale(usePathname() ?? "/");
  const translated = isLocalizedPath(path);
  const hrefFor = (target: Locale) =>
    translated || target === locale
      ? localizePath(path, target)
      : localizePath("/", target);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          "group inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:text-foreground",
          className,
        )}
      >
        <Global aria-hidden className="size-4" />
        <span className="sr-only">{t("label")}: </span>
        <span lang={locale}>{LOCALE_INFO[locale].name}</span>
        <ArrowDown2
          aria-hidden
          className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-56">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("label")}
        </DropdownMenuLabel>
        {!translated && (
          <p className="max-w-60 px-2 pb-1.5 text-xs text-pretty text-muted-foreground">
            {t("englishOnly")}
          </p>
        )}
        <DropdownMenuSeparator />
        {LOCALES.map((option) => {
          const current = option === locale;
          return (
            <DropdownMenuItem asChild key={option}>
              <a
                aria-current={current ? "true" : undefined}
                className="flex cursor-pointer items-center justify-between gap-4"
                href={hrefFor(option)}
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
