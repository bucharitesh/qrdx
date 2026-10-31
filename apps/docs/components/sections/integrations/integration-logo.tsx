import { cn } from "@repo/design-system/lib/utils";
import {
  type CatalogLogo,
  getCatalogEntry,
} from "@repo/integrations/src/catalog";
import {
  Chrome,
  Code1,
  CommandSquare,
  Figma,
  Flash,
  Gallery,
  Global,
  type Icon,
  Slack,
  Sms,
} from "iconsax-reactjs";

const BRAND_ICONS: Record<
  Extract<CatalogLogo, { type: "brand" }>["icon"],
  Icon
> = { Chrome, Figma, Slack };

const FEATURE_ICONS: Record<
  Extract<CatalogLogo, { type: "feature" }>["icon"],
  Icon
> = { Code1, CommandSquare, Flash, Gallery, Global, Sms };

/** The catalog logo for a registry integration, else its own light logo. */
export function logoForIntegration(
  slug: string,
  logos: { light: string },
): CatalogLogo {
  return getCatalogEntry(slug)?.logo ?? { type: "image", src: logos.light };
}

const SIZES = {
  sm: { tile: "size-8 p-1.5", icon: "size-4" },
  md: { tile: "size-11 p-2.5", icon: "size-5" },
  lg: { tile: "size-16 p-3.5", icon: "size-7" },
} as const;

interface IntegrationLogoProps {
  logo: CatalogLogo;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Brand logos sit on a white tile in both themes (they are drawn for light
 * backgrounds); QRdx's own features use an inverted tile with an iconsax icon.
 */
export function IntegrationLogo({
  logo,
  size = "md",
  className,
}: IntegrationLogoProps) {
  const sizes = SIZES[size];

  if (logo.type === "feature") {
    const FeatureIcon = FEATURE_ICONS[logo.icon];
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-foreground text-background ring-1 ring-foreground/10",
          sizes.tile,
          className,
        )}
      >
        <FeatureIcon variant="Bold" className={sizes.icon} />
      </span>
    );
  }

  const BrandIcon = logo.type === "brand" ? BRAND_ICONS[logo.icon] : null;

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-white ring-1 ring-black/5 dark:ring-white/10",
        sizes.tile,
        className,
      )}
    >
      {logo.type === "image" ? (
        <img src={logo.src} alt="" className="size-full object-contain" />
      ) : (
        BrandIcon && (
          <BrandIcon variant="Bold" color={logo.color} className="size-full" />
        )
      )}
    </span>
  );
}
