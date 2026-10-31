import { cn } from "@repo/design-system/lib/utils";
import { z } from "zod";
import { landingUrlSchema } from "@/types/landing";

// Shared props schemas, link helpers and class names for landing blocks.
// Server-safe: imported by block Render components and their editors.

/** Visible text: trimmed, single line. */
export const lineText = (max: number) => z.string().trim().max(max);

/** Multi-line text (newlines kept). */
export const longText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.replace(/\r\n?/g, "\n").trim());

/** Stable id of a list item (link, phone, ...); generated when missing. */
export const itemIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/)
  .default(() => newItemId());

export function newItemId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

const PHONE = /^\+?[0-9 ()./-]{3,32}$/;

export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine(
    (value) => PHONE.test(value),
    "Enter a phone number like +1 555 0100",
  );

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email("Enter an email address like name@example.com"));

/**
 * Link target for buttons and link lists: an http(s) URL or a mailto:, tel:
 * or sms: link (never javascript:, data: or other schemes).
 */
export const linkUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return true;
      if (url.protocol === "mailto:")
        return /^[^\s<>"]+@[^\s<>"]+$/.test(decodeURIComponent(url.pathname));
      if (url.protocol === "tel:" || url.protocol === "sms:") {
        return PHONE.test(decodeURIComponent(url.pathname));
      }
      return false;
    } catch {
      return false;
    }
  }, "Enter a full link starting with https:// (or mailto:, tel:, sms:)");

export const imageSchema = z.object({
  url: landingUrlSchema,
  alt: lineText(200).default(""),
});

export type LandingImage = z.output<typeof imageSchema>;

export const alignSchema = z.enum(["left", "center"]).default("center");

export const telHref = (number: string) =>
  `tel:${number.replace(/[^0-9+]/g, "")}`;
export const smsHref = (number: string) =>
  `sms:${number.replace(/[^0-9+]/g, "")}`;
export const mailHref = (address: string) => `mailto:${address}`;
export const whatsAppHref = (number: string) =>
  `https://wa.me/${number.replace(/[^0-9]/g, "")}`;

/** True for links that leave the page (opened in a new tab). */
export const isExternalLink = (href: string) => /^https?:/i.test(href);

export interface PostalAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export const addressSchema = z.object({
  street: lineText(200).default(""),
  city: lineText(100).default(""),
  region: lineText(100).default(""),
  postalCode: lineText(20).default(""),
  country: lineText(100).default(""),
});

/** Street, "City, Region Postal code", country: one line each. */
export function formatAddress(address: PostalAddress): string[] {
  const cityLine = [
    [address.city, address.region].filter(Boolean).join(", "),
    address.postalCode,
  ]
    .filter(Boolean)
    .join(" ");
  return [address.street, cityLine, address.country].filter(
    (line): line is string => Boolean(line?.trim()),
  );
}

export function mapLinks(query: string) {
  const q = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    embed: `https://maps.google.com/maps?q=${q}&output=embed`,
  };
}

// ─── Class names (theme custom properties come from components/landing/theme) ─

export const surfaceClass =
  "rounded-(--lp-radius) bg-(--lp-muted) text-(--lp-fg)";

export function buttonClass(
  variant: "filled" | "outline" | "soft" = "filled",
  className?: string,
) {
  return cn(
    "flex min-h-12 w-full items-center justify-center gap-2 rounded-(--lp-radius) px-4 py-3 text-center text-[15px] font-medium leading-snug transition-[filter,transform] hover:brightness-95 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lp-primary)",
    variant === "filled" && "bg-(--lp-primary) text-(--lp-primary-fg)",
    variant === "outline" &&
      "border-2 border-(--lp-primary) bg-transparent text-(--lp-fg)",
    variant === "soft" && "bg-(--lp-muted) text-(--lp-fg)",
    className,
  );
}

export const mutedTextClass = "text-(--lp-muted-fg)";

/** Attributes on every link a block renders (click analytics hook up to these). */
export function linkProps(href: string, blockId: string, target?: string) {
  const external = isExternalLink(href);
  return {
    href,
    "data-lp-block": blockId,
    ...(target && { "data-lp-target": target }),
    ...(external && { target: "_blank", rel: "noopener noreferrer nofollow" }),
  };
}
