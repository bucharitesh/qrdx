"use client";

import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { DocsLocaleMenu } from "@/components/docs/docs-locale-menu";

/**
 * The docs sidebar's footer: one bar with the language menu filling it and
 * the theme switch at its end. The bar fumadocs draws holds icon links and
 * the theme switch; the docs have no icon links, so that bar was mostly
 * empty, with the language menu stacked under it as a second box. The
 * layout turns that theme switch off (themeSwitch.enabled: false) and
 * renders this instead, with the same classes as the fumadocs bar. It also
 * shows at the bottom of the mobile menu.
 */
export function DocsSidebarFooter() {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-fd-secondary/50 p-0.5 text-fd-muted-foreground">
      <DocsLocaleMenu />
      <ThemeSwitch className="ms-auto shrink-0 rounded-none border-y-0 border-e-0 px-1 py-0 *:rounded-md" />
    </div>
  );
}
