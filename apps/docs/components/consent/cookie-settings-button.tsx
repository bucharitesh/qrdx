"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { openCookieSettings } from "./open-cookie-settings";

/** Reopens the cookie preferences dialog. Styled like a footer link by default. */
export function CookieSettingsButton({
  className,
  children,
  ...props
}: Omit<ComponentProps<"button">, "type" | "onClick">) {
  const t = useTranslations("consent");
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className={cn(
        "rounded-sm text-left text-sm/snug text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    >
      {children ?? t("settingsButton")}
    </button>
  );
}
