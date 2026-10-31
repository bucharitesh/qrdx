"use client";

import {
  LinkedinLogo,
  Star,
  XLogo,
} from "@repo/design-system/components/icons";
import { cn } from "@repo/design-system/lib/utils";
import {
  Bag2,
  Bitcoin,
  Bookmark,
  CalendarTick,
  Call,
  Ethereum,
  Facebook,
  Google,
  GoogleDrive,
  Hashtag,
  type Icon,
  Instagram,
  Link,
  Link2,
  Location,
  Messages2,
  MessageText,
  MoneySend,
  Musicnote,
  Paypal,
  Personalcard,
  Shop,
  ShoppingCart,
  Sms,
  Snapchat,
  Spotify,
  TaskSquare,
  Text,
  WalletMoney,
  Whatsapp,
  Wifi,
  Youtube,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import {
  IntegrationLogo,
  logoForIntegration,
} from "@/components/sections/integrations/integration-logo";
import { getIntegrationByContentType } from "@/lib/integration-catalog";
import type { ContentType } from "@/types/qr-content";

type AnyIcon = Icon | ComponentType<{ className?: string }>;

/** iconsax names used by CONTENT_TYPES_METADATA and CONTENT_CATEGORIES. */
const ICONS: Record<string, AnyIcon> = {
  Bag2,
  Bitcoin,
  Bookmark,
  CalendarTick,
  Call,
  Ethereum,
  Facebook,
  Google,
  GoogleDrive,
  Hashtag,
  Instagram,
  Link,
  Link2,
  LinkedinLogo,
  Location,
  MessageText,
  Messages2,
  MoneySend,
  Musicnote,
  Paypal,
  Personalcard,
  Shop,
  ShoppingCart,
  Sms,
  Snapchat,
  Spotify,
  Star1: Star,
  TaskSquare,
  Text,
  WalletMoney,
  Whatsapp,
  Wifi,
  XLogo,
  Youtube,
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
