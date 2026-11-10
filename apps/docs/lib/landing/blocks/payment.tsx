import { cn } from "@repo/design-system/lib/utils";
import {
  Bank,
  Card,
  Coin,
  Coin1,
  DollarSquare,
  ExportSquare,
  Mobile,
  MoneyChange,
  MoneySend,
  Moneys,
  Wallet,
  Wallet2,
} from "iconsax-reactjs";
import type { ComponentType } from "react";
import {
  buttonClass,
  buttonShapeClass,
  linkProps,
  mutedTextClass,
  surfaceClass,
} from "@/components/landing/block-kit";
import { LpHeading } from "@/components/landing/heading";
import { type BlockRenderProps, registerBlock } from "../registry";
import { CopyButton } from "./coupon-copy";
import { PaymentEditor } from "./payment-editor";
import {
  detailLines,
  PAYMENT_ACTION_LABELS,
  PAYMENT_TYPE_LABELS,
  type PaymentProps,
  type PaymentType,
  paymentSchema,
} from "./payment-schema";

// Neutral marks, one per method, never look-alikes of a brand's logo (owner
// rule: brand marks are the real logos). The method's name is always shown.
const PAYMENT_ICONS: Record<
  PaymentType,
  ComponentType<{ className?: string }>
> = {
  paypal: Wallet2,
  venmo: MoneySend,
  cashapp: DollarSquare,
  revolut: Card,
  wise: MoneyChange,
  upi: Mobile,
  bank: Bank,
  bitcoin: Coin,
  ethereum: Coin1,
  other: Wallet,
};

function PaymentBlock({ id, props, context }: BlockRenderProps<PaymentProps>) {
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
          const name = method.label || PAYMENT_TYPE_LABELS[method.type];
          const lines = detailLines(method.details);
          const verb = PAYMENT_ACTION_LABELS[props.action];
          const action =
            method.type === "other" && !method.label
              ? verb
              : `${verb} with ${name}`;
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
                        label={`Copy ${line.label || name}`}
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
