import { cn } from "@repo/design-system/lib/utils";

const SIZES = {
  sm: "size-9 rounded-lg text-sm",
  md: "size-12 rounded-xl text-base",
  lg: "size-16 rounded-2xl text-xl",
} as const;

/**
 * An OAuth app's logo on a neutral tile, or its initial when it has none.
 * Logos are third-party URLs: no referrer is sent when loading them.
 */
export function OAuthAppLogo({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden border font-semibold",
        SIZES[size],
        className,
      )}
    >
      {logoUrl ? (
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          referrerPolicy="no-referrer"
          src={logoUrl}
        />
      ) : (
        <span aria-hidden>{name.trim().charAt(0).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}
