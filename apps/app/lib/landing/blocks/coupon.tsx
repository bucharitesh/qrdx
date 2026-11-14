import { cn } from "@repo/design-system/lib/utils";
import {
  CalendarTick as CalendarClock,
  TicketDiscount as TicketPercent,
} from "iconsax-reactjs";
import { useLocale, useTranslations } from "next-intl";
import {
  buttonClass,
  buttonShapeClass,
  linkProps,
  mutedTextClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { type BlockRenderProps, registerBlock } from "../registry";
import { Barcode } from "./coupon-barcode";
import { CopyButton } from "./coupon-copy";
import { CouponEditor } from "./coupon-editor";
import { CouponRedeem } from "./coupon-redeem";
import {
  type CouponProps,
  type CouponStatus,
  couponSchema,
  couponStatus,
  formatDay,
} from "./coupon-schema";

type CouponT = ReturnType<typeof useTranslations<"scanPages.hosted.coupon">>;

/** couponStatus's label, in the page's language. */
function validityLabel(
  { validFrom, validUntil }: CouponProps,
  { state }: CouponStatus,
  t: CouponT,
  locale: string,
): string | null {
  const day = (date: string) => formatDay(date, locale);
  if (state === "expired" && validUntil) {
    return t("expiredOn", { date: day(validUntil) });
  }
  if (validFrom && validUntil) {
    return t("validRange", { from: day(validFrom), until: day(validUntil) });
  }
  if (state === "upcoming" && validFrom) {
    return t("validFrom", { date: day(validFrom) });
  }
  return validUntil ? t("validUntil", { date: day(validUntil) }) : null;
}

export function CouponBlock({
  id,
  props,
  context,
}: BlockRenderProps<CouponProps>) {
  const t = useTranslations("scanPages.hosted.coupon");
  const locale = useLocale();
  const status = couponStatus(props);
  const label = status.label && validityLabel(props, status, t, locale);
  const titleId = `${id}-title`;
  const inactive = status.state !== "valid";

  return (
    <article
      aria-labelledby={titleId}
      className="overflow-hidden rounded-(--lp-radius) border-2 border-dashed border-(--lp-primary) bg-(--lp-muted)"
    >
      <div className="space-y-1 bg-(--lp-primary) px-5 py-4 text-(--lp-primary-fg)">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase opacity-80">
          <TicketPercent aria-hidden="true" className="size-3.5" />
          {t("coupon")}
        </p>
        <LpHeading
          as="h2"
          preview={context.thumbnail}
          className="text-2xl leading-tight font-bold text-balance"
          id={titleId}
        >
          {props.headline}
        </LpHeading>
        {props.description && (
          <p className="text-sm whitespace-pre-line opacity-90">
            {props.description}
          </p>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-stretch gap-2">
          <p
            className={cn(
              "flex flex-1 items-center justify-center rounded-(--lp-radius) border border-dashed border-(--lp-fg)/30 bg-(--lp-bg) px-4 py-3 text-center font-mono text-xl font-bold tracking-widest break-all",
              inactive && "opacity-60",
            )}
          >
            <span className="sr-only">{t("code")} </span>
            {props.code}
          </p>
          <CopyButton
            label={t("copyCode")}
            text={{ copy: t("copy"), copied: t("copied") }}
            value={props.code}
          />
        </div>

        {props.barcode !== "none" && (
          <div className="rounded-(--lp-radius) bg-white p-3">
            <Barcode
              className="mx-auto h-24 w-full max-w-xs"
              format={props.barcode}
              value={props.barcodeValue || props.code}
            />
          </div>
        )}

        {label && (
          <p
            className={cn(
              "flex items-center justify-center gap-1.5 text-sm",
              inactive ? "font-medium" : mutedTextClass,
            )}
          >
            <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </p>
        )}

        {props.redeemable && (
          <CouponRedeem
            blockId={id}
            live={context.mode === "live"}
            pageId={context.pageId}
            qrCodeId={context.qrCodeId}
            shapeClassName={buttonShapeClass(context.theme)}
            text={{
              redeemed: t.raw("redeemed") as string,
              instructions: t.rich("instructions", {
                strong: (chunks) => <strong>{chunks}</strong>,
              }),
              cancel: t("cancel"),
              redeemNow: t("redeemNow"),
              redeem: t("redeem"),
            }}
            unavailable={
              status.state === "expired"
                ? t("expired")
                : status.state === "upcoming"
                  ? t("notYet")
                  : undefined
            }
          />
        )}

        {props.cta && (
          <a
            className={buttonClass("outline", buttonShapeClass(context.theme))}
            {...linkProps(props.cta.url, id)}
          >
            {props.cta.label}
          </a>
        )}

        {props.terms && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium select-none">
              {t("terms")}
            </summary>
            <p className={cn(mutedTextClass, "mt-2 whitespace-pre-line")}>
              {props.terms}
            </p>
          </details>
        )}
      </div>
    </article>
  );
}

registerBlock({
  type: "coupon",
  category: "commerce",
  label: "Coupon",
  description: "A discount code with barcode, validity dates and terms",
  icon: TicketPercent,
  schema: couponSchema,
  defaults: {
    headline: "20% off your next order",
    code: "WELCOME20",
    barcode: "code128",
  },
  Render: CouponBlock,
  Editor: CouponEditor,
});
