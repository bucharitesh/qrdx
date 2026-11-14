import { cn } from "@repo/design-system/lib/utils";
import { Bank, ExportSquare, Mobile, Moneys, Wallet } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import {
  buttonClass,
  buttonShapeClass,
  linkProps,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { brandIcon } from "@/lib/brand-logos/brand-logo";
import { type BlockRenderProps, registerBlock } from "../registry";
import { CopyButton } from "./coupon-copy";
import { PaymentEditor } from "./payment-editor";
import {
  detailLines,
  PAYMENT_TYPE_LABELS,
  type PaymentProps,
  type PaymentType,
  paymentSchema,
} from "./payment-schema";

// Brands get their real marks (Simple Icons) in the text color, never
// look-alikes (owner rule). UPI isn't in Simple Icons, so it and the
// generic methods keep neutral iconsax glyphs. The name is always shown.
const PAYMENT_ICONS: Record<
  PaymentType,
  ComponentType<{ className?: string }>
> = {
  paypal: brandIcon("paypal"),
  venmo: brandIcon("venmo"),
  cashapp: brandIcon("cashapp"),
  revolut: brandIcon("revolut"),
  wise: brandIcon("wise"),
  upi: Mobile,
  bank: Bank,
  bitcoin: brandIcon("bitcoin"),
  ethereum: brandIcon("ethereum"),
  other: Wallet,
};

function PaymentBlock({ id, props, context }: BlockRenderProps<PaymentProps>) {
  const t = useTranslations("scanPages.hosted");
  if (props.methods.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section
      aria-label={props.title ? undefined : "Ways to pay"}
      aria-labelledby={props.title ? titleId : undefined}
      className="space-y-3"
    >
      {props.title && (
        <LpHeading
          as="h2"
          className="text-lg font-semibold tracking-tight"
          id={titleId}
          preview={context.thumbnail}
        >
          {props.title}
        </LpHeading>
      )}
      <ul className="space-y-2">
        {props.methods.map((method) => {
          const Icon = PAYMENT_ICONS[method.type];
          // Brand names stay as they are; "Bank transfer" and "Other" are QRdx's.
          const name =
            method.label ||
            (method.type === "bank" || method.type === "other"
              ? t(`payment.types.${method.type}`)
              : PAYMENT_TYPE_LABELS[method.type]);
          const lines = detailLines(method.details);
          const action =
            method.type === "other" && !method.label
              ? t(`payment.actions.${props.action}`)
              : t(`payment.actionsWith.${props.action}`, { method: name });
          return (
            <li className={cn(surfaceClass, "space-y-3 p-4")} key={method.id}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--lp-fg)/8">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{name}</p>
                  {method.note && (
                    <p className={cn(mutedTextClass, "text-sm")}>
                      {method.note}
                    </p>
                  )}
                </div>
              </div>
              {lines.length > 0 && (
                <dl className="space-y-2">
                  {lines.map((line, index) => (
                    <div
                      className="flex items-center justify-between gap-3"
                      // Lines have no ids; their order is their identity.
                      key={index}
                    >
                      <div className="min-w-0">
                        {line.label && (
                          <dt className={cn(mutedTextClass, "text-xs")}>
                            {line.label}
                          </dt>
                        )}
                        <dd className="font-mono text-sm font-medium break-all">
                          {line.value}
                        </dd>
                      </div>
                      <CopyButton
                        label={t("payment.copyLine", {
                          label: line.label || name,
                        })}
                        text={{
                          copy: t("coupon.copy"),
                          copied: t("coupon.copied"),
                        }}
                        value={line.value}
                      />
                    </div>
                  ))}
                </dl>
              )}
              {method.url && (
                <a
                  className={buttonClass(
                    "filled",
                    buttonShapeClass(context.theme),
                  )}
                  {...linkProps(method.url, id, method.id)}
                >
                  {action}
                  <ExportSquare aria-hidden="true" className="size-4" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {props.note && (
        <p className={cn(mutedTextClass, "text-sm whitespace-pre-line")}>
          {props.note}
        </p>
      )}
    </section>
  );
}

export const paymentBlock = registerBlock({
  type: "payment",
  category: "commerce",
  label: "Payment links",
  description:
    "PayPal, Venmo, bank details and more. Payments happen in each app",
  icon: Moneys,
  schema: paymentSchema,
  defaults: {
    methods: [
      { id: "pay1", type: "paypal", url: "https://paypal.me/" },
      {
        id: "pay2",
        type: "bank",
        details: "Account name: Your name\nIBAN: GB33 BUKB 2020 1555 5555 55",
      },
    ],
  },
  Render: PaymentBlock,
  Editor: PaymentEditor,
});
