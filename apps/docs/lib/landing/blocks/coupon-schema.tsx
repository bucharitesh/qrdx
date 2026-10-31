import { z } from "zod";
import {
  lineText,
  linkUrlSchema,
  longText,
} from "@/components/landing/block-kit";
import { barcodeError } from "./coupon-barcode";
import { isValidLocalDateTime } from "./event-calendar";

// Props of the coupon block (shared by its Render, Editor and the dashboard).

/** landing_event.type recorded when a visitor taps "Redeem" (target = block id). */
export const COUPON_REDEEM_EVENT = "coupon_redeem";

export const BARCODE_OPTIONS = ["none", "code128", "ean13"] as const;

const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) && isValidLocalDateTime(value)),
    "Use a date like 2026-12-31",
  )
  .default("");

export const couponSchema = z
  .object({
    headline: lineText(80).min(1, "Add a headline like 20% off"),
    description: longText(500).default(""),
    code: lineText(48).min(1, "Enter the coupon code"),
    barcode: z.enum(BARCODE_OPTIONS).default("code128"),
    /** Encoded in the barcode instead of `code` (e.g. a POS EAN) */
    barcodeValue: lineText(48).default(""),
    /** YYYY-MM-DD, inclusive */
    validFrom: optionalDate,
    validUntil: optionalDate,
    terms: longText(2000).default(""),
    /** "Redeem" button that counts redemptions */
    redeemable: z.boolean().default(false),
    cta: z
      .object({ label: lineText(40).min(1, "Add a label"), url: linkUrlSchema })
      .optional(),
  })
  .superRefine((coupon, ctx) => {
    if (coupon.barcode !== "none") {
      const error = barcodeError(
        coupon.barcode,
        coupon.barcodeValue || coupon.code,
      );
      if (error) {
        ctx.addIssue({
          code: "custom",
          message: error,
          path: [coupon.barcodeValue ? "barcodeValue" : "code"],
        });
      }
    }
    if (
      coupon.validFrom &&
      coupon.validUntil &&
      coupon.validUntil < coupon.validFrom
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The end date is before the start date",
        path: ["validUntil"],
      });
    }
  });

export type CouponProps = z.output<typeof couponSchema>;

const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

export type CouponStatus =
  | { state: "valid"; label: string | null }
  | { state: "upcoming" | "expired"; label: string };

/**
 * Validity in words. Dates have no time zone, so a coupon counts as started
 * once its first day has begun anywhere (UTC+14) and expired only after its
 * last day has ended everywhere (UTC-12).
 */
export function couponStatus(
  coupon: Pick<CouponProps, "validFrom" | "validUntil">,
  now: Date = new Date(),
): CouponStatus {
  const { validFrom, validUntil } = coupon;
  if (
    validUntil &&
    now.getTime() > Date.parse(`${validUntil}T23:59:59-12:00`)
  ) {
    return { state: "expired", label: `Expired on ${formatDay(validUntil)}` };
  }
  if (validFrom && now.getTime() < Date.parse(`${validFrom}T00:00:00+14:00`)) {
    return {
      state: "upcoming",
      label: validUntil
        ? `Valid ${formatDay(validFrom)} – ${formatDay(validUntil)}`
        : `Valid from ${formatDay(validFrom)}`,
    };
  }
  if (validFrom && validUntil) {
    return {
      state: "valid",
      label: `Valid ${formatDay(validFrom)} – ${formatDay(validUntil)}`,
    };
  }
  return {
    state: "valid",
    label: validUntil ? `Valid until ${formatDay(validUntil)}` : null,
  };
}
