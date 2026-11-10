"use client";

import { LinkedinLogo, Star } from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  Bag2,
  Call,
  Hashtag,
  type Icon,
  Link,
  Link2,
  Location,
  MessageText,
  MoneySend,
  Personalcard,
  Shop,
  ShoppingCart,
  Sms,
  TaskSquare,
  Text,
  WalletMoney,
  Wifi,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import {
  IntegrationLogo,
  logoForIntegration,
} from "@/components/sections/integrations/integration-logo";
import { brandIcon } from "@/lib/brand-logos/brand-logo";
import { CONTENT_TYPE_BRANDS } from "@/lib/brand-logos/content-types";
import { getIntegrationByContentType } from "@/lib/integration-catalog";
import type { ContentType } from "@/types/qr-content";

type AnyIcon = Icon | ComponentType<{ className?: string }>;

/**
 * Icon names used by CONTENT_TYPES_METADATA and CONTENT_CATEGORIES: iconsax
 * names, and "brand:<type>" for a type's real brand mark.
 */
const ICONS: Record<string, AnyIcon> = {
  Bag2,
  Call,
  Hashtag,
  Link,
  Link2,
  LinkedinLogo,
  Location,
  MessageText,
  MoneySend,
  Personalcard,
  Shop,
  ShoppingCart,
  Sms,
  Star1: Star,
  TaskSquare,
  Text,
  WalletMoney,
  Wifi,
  ...Object.fromEntries(
    Object.entries(CONTENT_TYPE_BRANDS).map(([type, slug]) => [
      `brand:${type}`,
      brandIcon(slug),
    ]),
  ),
};

export function getTypeIcon(name: string | undefined): AnyIcon {
  return (name && ICONS[name]) || Link;
}

/** Icon tile for a QR type: a third-party logo for app integrations, otherwise an iconsax icon. */
export function TypeIconTile({
  type,
  icon,
  className,
}: {
  type?: ContentType;
  icon?: string;
  className?: string;
}) {
  const integration = getIntegrationByContentType(type);
  const IconComponent = getTypeIcon(icon);

  if (integration && type !== "google-drive") {
    return (
      <IntegrationLogo
        className={cn("size-9", className)}
        logo={logoForIntegration(integration.slug, integration.logos)}
        size="sm"
      />
    );
  }

  return (
    <span
      className={cn(
        "bg-muted/40 text-foreground/80 grid size-9 shrink-0 place-items-center rounded-lg border",
        className,
      )}
    >
      <IconComponent className="size-4" />
    </span>
  );
}
