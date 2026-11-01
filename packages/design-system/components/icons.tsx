import { Add, type IconProps } from "iconsax-reactjs";
import type { SVGProps } from "react";
import { cn } from "../lib/utils";

// Icons the iconsax set doesn't have. Everything else comes from
// "iconsax-reactjs" directly (see .claude/build/ICON-MAP.md for the mapping).

/** Plain close cross (iconsax Add, rotated). */
export function Close({ className, ...props }: IconProps) {
  return <Add className={cn("rotate-45", className)} {...props} />;
}

/**
 * Plain check mark. iconsax only ships ticks inside a circle or square
 * (TickCircle, TickSquare); its `Check` is a bank cheque.
 */
export function Tick({
  className,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  variant: _variant,
  ...props
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

/**
 * Whole star, the iconsax Star1 outline. iconsax's filled stars are split in
 * two halves (Star1 Bold/Bulk), so `variant="Bold"` fills this outline instead.
 */
/**
 * A plain play triangle with rounded corners. iconsax's Play draws a split
 * glyph; `variant="Bold"` (or "Bulk") fills this one, Linear outlines it.
 */
export function Play({
  className,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  variant = "Linear",
  ...props
}: IconProps) {
  const filled = variant === "Bold" || variant === "Bulk";
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path
        d="M7.5 5.6v12.8c0 1.1 1.2 1.78 2.14 1.2l10.24-6.4a1.42 1.42 0 0 0 0-2.4L9.64 4.4c-.94-.58-2.14.1-2.14 1.2Z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export function Star({
  className,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  variant = "Linear",
  ...props
}: IconProps) {
  const filled = variant === "Bold" || variant === "Bulk";
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path
        d="m13.73 3.51 1.76 3.52c.24.49.88.96 1.42 1.05l3.19.53c2.04.34 2.52 1.82 1.05 3.28l-2.48 2.48c-.42.42-.65 1.23-.52 1.81l.71 3.07c.56 2.43-.73 3.37-2.88 2.1l-2.99-1.77c-.54-.32-1.43-.32-1.98 0l-2.99 1.77c-2.14 1.27-3.44.32-2.88-2.1l.71-3.07c.13-.58-.1-1.39-.52-1.81l-2.48-2.48c-1.46-1.46-.99-2.94 1.05-3.28l3.19-.53c.53-.09 1.17-.56 1.41-1.05l1.76-3.52c.96-1.91 2.52-1.91 3.47 0Z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

/**
 * Info "i" in a circle. iconsax's InfoCircle is an exclamation mark ("!"),
 * which reads as a warning next to a help hint.
 */
export function Info({
  className,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  variant: _variant,
  ...props
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path
        d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10ZM12 11v5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M12 7.8h.01"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={Number(strokeWidth) + 0.75}
      />
    </svg>
  );
}

/** AI assistant / bot, drawn in the iconsax Linear style (iconsax has none). */
export function Bot({
  className,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.5,
  variant: _variant,
  ...props
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path
        d="M8.5 7.5h7c2.5 0 4 1.5 4 4V16c0 2.5-1.5 4-4 4h-7c-2.5 0-4-1.5-4-4v-4.5c0-2.5 1.5-4 4-4ZM12 7.5V4.75M2 13v2M22 13v2M10 16.5h4"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M12 2.75h.01M9.25 12.25v1M14.75 12.25v1"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={Number(strokeWidth) + 0.75}
      />
    </svg>
  );
}

/** Loading spinner drawn with the iconsax 1.5px stroke. */
export function Spinner({
  className,
  size = 24,
  color = "currentColor",
  ...props
}: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("animate-spin", className)}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        opacity=".2"
        r="9"
        stroke={color}
        strokeWidth="1.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

type LogoProps = SVGProps<SVGSVGElement> & { size?: number | string };

const logo =
  (path: string) =>
  ({ size = 24, ...props }: LogoProps) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path d={path} />
    </svg>
  );

/** Brand marks iconsax doesn't ship. */
export const GithubLogo = logo(
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
);
export const LinkedinLogo = logo(
  "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"
);
export const XLogo = logo(
  "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.48 3.24H4.3l13.31 17.41Z"
);
export const GoogleLogo = logo(
  "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
);

/** Contrast: a circle split down the middle, the right half hatched. */
export function Contrast({ size = 24, ...props }: LogoProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 3l0 18" />
      <path d="M12 9l4.65 -4.65" />
      <path d="M12 14.3l7.37 -7.37" />
      <path d="M12 19.6l8.85 -8.85" />
    </svg>
  );
}
