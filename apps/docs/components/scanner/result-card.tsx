"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Barcode,
  Brush2,
  Calendar1 as CalendarDays,
  CalendarAdd as CalendarPlus,
  Personalcard as Contact,
  Import as Download,
  Eye,
  EyeSlash as EyeOff,
  Link2,
  type Icon as LucideIcon,
  Sms as Mail,
  Location as MapPin,
  MessageSquare,
  Box as Package,
  Call as Phone,
  SearchNormal1 as Search,
  Text as Type,
  Wallet,
  Wifi,
} from "iconsax-reactjs";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { parseLinkUrl, playgroundHref } from "@/lib/playground-links";
import { OpenButton } from "./confirm-open";
import { formatLabel } from "./detector";
import { downloadText, fileSlug } from "./download";
import { LinkPreview } from "./link-preview";
import {
  type CalendarEvent,
  type ParsedScan,
  type PaymentScheme,
  parseScan,
  type ScanKind,
} from "./parse";
import { CopyButton, FieldList, LinkButton } from "./ui";

export const KIND_ICONS: Record<ScanKind, LucideIcon> = {
  url: Link2,
  wifi: Wifi,
  contact: Contact,
  event: CalendarDays,
  geo: MapPin,
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  payment: Wallet,
  gs1: Package,
  product: Barcode,
  text: Type,
};

const PAYMENT_NAMES: Record<PaymentScheme, string> = {
  upi: "UPI",
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  paypal: "PayPal",
  venmo: "Venmo",
  epc: "SEPA transfer (EPC)",
  pix: "Pix",
  paynow: "PayNow",
  promptpay: "PromptPay",
  vietqr: "VietQR",
  emv: "Payment code (EMV)",
  litecoin: "Litecoin",
  dogecoin: "Dogecoin",
  bitcoincash: "Bitcoin Cash",
  solana: "Solana Pay",
  monero: "Monero",
};

/** The copy button's label: scanner.result.<key>. */
const COPY_LABELS = {
  upi: "copyUpi",
  bitcoin: "copyAddress",
  ethereum: "copyAddress",
  paypal: "copyLink",
  venmo: "copyUsername",
  epc: "copyIban",
  pix: "copyPixKey",
  paynow: "copyNumber",
  promptpay: "copyNumber",
  vietqr: "copyAccount",
  emv: "copyMerchant",
  litecoin: "copyAddress",
  dogecoin: "copyAddress",
  bitcoincash: "copyAddress",
  solana: "copyAddress",
  monero: "copyAddress",
} as const satisfies Record<PaymentScheme, string>;

type Translate = ReturnType<typeof useTranslations<"scanner.result">>;

/** Bank codes paid by scanning them in a banking app (no link to open). */
const BANK_APP_SCHEMES = new Set<PaymentScheme>([
  "pix",
  "paynow",
  "promptpay",
  "vietqr",
  "emv",
]);

/**
 * "Restyle in the playground" for a scanned web address: the address goes
 * after the `#`, so it never reaches a server. Null for anything that isn't
 * http(s). No analytics: the scanner tracks nothing.
 */
export function restyleHref(url: string): string | null {
  return parseLinkUrl(url) ? playgroundHref({ url }) : null;
}

/** mailto: address part, percent-encoded except the characters addresses need. */
function mailtoAddress(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@").replace(/%2C/gi, ",");
}

function formatWhen(
  value: string | undefined,
  allDay: boolean,
  locale: string,
): string | null {
  if (!value) return null;
  const date = new Date(allDay ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return allDay
    ? date.toLocaleDateString(locale, { dateStyle: "full" })
    : date.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
}

function eventFields(event: CalendarEvent, t: Translate, locale: string) {
  const start = formatWhen(event.start, event.allDay, locale);
  const end = formatWhen(event.end, event.allDay, locale);
  return [
    start && { label: t("starts"), value: start },
    end && { label: t("ends"), value: end },
    event.location && { label: t("where"), value: event.location },
    event.description && { label: t("details"), value: event.description },
  ].filter((field): field is { label: string; value: string } =>
    Boolean(field),
  );
}

function WifiDetails({
  parsed,
}: {
  parsed: Extract<ParsedScan, { kind: "wifi" }>;
}) {
  const t = useTranslations("scanner.result");
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <FieldList
        fields={[
          { label: t("ssid"), value: parsed.ssid },
          { label: t("security"), value: parsed.security },
          ...(parsed.hidden ? [{ label: t("hidden"), value: t("yes") }] : []),
          ...(parsed.password
            ? [
                {
                  label: t("password"),
                  mono: true,
                  value: (
                    <span className="inline-flex items-center gap-2">
                      <span>
                        {revealed
                          ? parsed.password
                          : "•".repeat(Math.min(parsed.password.length, 16))}
                      </span>
                      <button
                        aria-label={t(
                          revealed ? "hidePassword" : "showPassword",
                        )}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setRevealed((value) => !value)}
                        type="button"
                      >
                        {revealed ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {parsed.password && (
          <CopyButton label={t("copyPassword")} value={parsed.password} />
        )}
        <CopyButton label={t("copyNetwork")} value={parsed.ssid} />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("wifiNote", { ssid: parsed.ssid })}
      </p>
    </div>
  );
}

function PaymentDetails({
  parsed,
}: {
  parsed: Extract<ParsedScan, { kind: "payment" }>;
}) {
  const t = useTranslations("scanner.result");
  const name = PAYMENT_NAMES[parsed.scheme];
  const confirm = {
    title: t("payTitle", { name, payee: parsed.payee }),
    description: (
      <>
        <p>
          {parsed.amount
            ? t("payBodyAmount", { name, amount: parsed.amount })
            : t("payBody", { name })}
        </p>
        <p>{t("payCheck")}</p>
      </>
    ),
    action: t("payOpen", { name }),
  };
  return (
    <div className="flex flex-col gap-3">
      <FieldList
        fields={parsed.fields.map((field) => ({
          ...field,
          mono: /address|iban|upi id|recipient|contract|pix key|account|uen/i.test(
            field.label,
          ),
        }))}
      />
      {parsed.openUrl && /^https:/i.test(parsed.openUrl) ? (
        <LinkPreview
          confirm={confirm}
          openLabel={t("payWith", { name })}
          url={parsed.openUrl}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {parsed.openUrl && (
            <OpenButton confirm={confirm} href={parsed.openUrl}>
              <Wallet className="size-3.5" />
              {t("payWith", { name })}
            </OpenButton>
          )}
          <CopyButton
            label={t(COPY_LABELS[parsed.scheme])}
            value={parsed.copyValue}
          />
        </div>
      )}
      {parsed.scheme === "epc" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("epcNote")}
        </p>
      )}
      {BANK_APP_SCHEMES.has(parsed.scheme) && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("bankAppNote", { name })}
        </p>
      )}
      {parsed.scheme === "upi" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("upiNote")}
        </p>
      )}
    </div>
  );
}

function Details({ parsed }: { parsed: ParsedScan }) {
  const t = useTranslations("scanner.result");
  const locale = useLocale();
  switch (parsed.kind) {
    case "url": {
      const restyle = restyleHref(parsed.url);
      return (
        <div className="flex flex-col gap-4">
          {parsed.gs1 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                GS1 Digital Link
              </p>
              <FieldList
                fields={parsed.gs1.fields.map((field) => ({
                  ...field,
                  mono: true,
                }))}
              />
            </div>
          )}
          <LinkPreview url={parsed.url} />
          {restyle && (
            <Link
              className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs underline-offset-4 transition-colors hover:underline"
              href={restyle}
              // A phone camera tool: don't fetch the editor until asked.
              prefetch={false}
            >
              <Brush2 aria-hidden className="size-3.5 shrink-0" />
              {t("restyle")}
            </Link>
          )}
        </div>
      );
    }
    case "wifi":
      return <WifiDetails parsed={parsed} />;
    case "contact": {
      const { contact } = parsed;
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              { label: t("name"), value: contact.name },
              ...(contact.organization
                ? [{ label: t("organization"), value: contact.organization }]
                : []),
              ...(contact.title
                ? [{ label: t("jobTitle"), value: contact.title }]
                : []),
              ...contact.phones.map((phone, index) => ({
                label: index === 0 ? t("phone") : t("phoneN", { n: index + 1 }),
                value: (
                  <a
                    className="underline underline-offset-4"
                    href={`tel:${phone.replace(/[^\d+*#,;]/g, "")}`}
                  >
                    {phone}
                  </a>
                ),
              })),
              ...contact.emails.map((email, index) => ({
                label: index === 0 ? t("email") : t("emailN", { n: index + 1 }),
                value: (
                  <a
                    className="underline underline-offset-4"
                    href={`mailto:${mailtoAddress(email)}`}
                  >
                    {email}
                  </a>
                ),
              })),
              ...contact.urls.map((url, index) => ({
                label:
                  index === 0 ? t("website") : t("websiteN", { n: index + 1 }),
                value: url,
                mono: true,
              })),
              ...(contact.address
                ? [{ label: t("address"), value: contact.address }]
                : []),
              ...(contact.note
                ? [{ label: t("note"), value: contact.note }]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                downloadText(
                  parsed.vcard,
                  `${fileSlug(contact.name, "contact")}.vcf`,
                  "text/vcard;charset=utf-8",
                )
              }
              size="sm"
              type="button"
            >
              <Download className="size-3.5" />
              {t("saveContact")}
            </Button>
          </div>
        </div>
      );
    }
    case "event":
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              { label: t("event"), value: parsed.event.summary },
              ...eventFields(parsed.event, t, locale),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                downloadText(
                  parsed.ics,
                  `${fileSlug(parsed.event.summary, "event")}.ics`,
                  "text/calendar;charset=utf-8",
                )
              }
              size="sm"
              type="button"
            >
              <CalendarPlus className="size-3.5" />
              {t("addToCalendar")}
            </Button>
          </div>
        </div>
      );
    case "geo": {
      const coords = `${parsed.lat},${parsed.lon}`;
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              ...(parsed.label
                ? [{ label: t("place"), value: parsed.label }]
                : []),
              {
                label: t("coordinates"),
                value: `${parsed.lat}, ${parsed.lon}`,
                mono: true,
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              external
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`}
            >
              <MapPin className="size-3.5" />
              Google Maps
            </LinkButton>
            <LinkButton
              external
              href={`https://www.openstreetmap.org/?mlat=${parsed.lat}&mlon=${parsed.lon}#map=16/${parsed.lat}/${parsed.lon}`}
            >
              <MapPin className="size-3.5" />
              OpenStreetMap
            </LinkButton>
            <CopyButton label={t("copyCoordinates")} value={coords} />
          </div>
        </div>
      );
    }
    case "phone":
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[{ label: t("number"), value: parsed.number, mono: true }]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`tel:${parsed.number.replace(/[^\d+*#,;]/g, "")}`}
            >
              <Phone className="size-3.5" />
              {t("call")}
            </LinkButton>
            <CopyButton label={t("copyNumber")} value={parsed.number} />
          </div>
        </div>
      );
    case "sms":
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              ...(parsed.number
                ? [{ label: t("to"), value: parsed.number, mono: true }]
                : []),
              ...(parsed.body
                ? [{ label: t("message"), value: parsed.body }]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`sms:${parsed.number.replace(/[^\d+*#]/g, "")}${parsed.body ? `?body=${encodeURIComponent(parsed.body)}` : ""}`}
            >
              <MessageSquare className="size-3.5" />
              {t("writeText")}
            </LinkButton>
            {parsed.number && (
              <CopyButton label={t("copyNumber")} value={parsed.number} />
            )}
          </div>
          <p className="text-muted-foreground text-xs">{t("smsNote")}</p>
        </div>
      );
    case "email": {
      const query = new URLSearchParams();
      if (parsed.subject) query.set("subject", parsed.subject);
      if (parsed.body) query.set("body", parsed.body);
      const search = query.toString().replace(/\+/g, "%20");
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              { label: t("to"), value: parsed.to, mono: true },
              ...(parsed.subject
                ? [{ label: t("subject"), value: parsed.subject }]
                : []),
              ...(parsed.body
                ? [{ label: t("message"), value: parsed.body }]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`mailto:${mailtoAddress(parsed.to)}${search ? `?${search}` : ""}`}
            >
              <Mail className="size-3.5" />
              {t("writeEmail")}
            </LinkButton>
            <CopyButton label={t("copyAddress")} value={parsed.to} />
          </div>
        </div>
      );
    }
    case "payment":
      return <PaymentDetails parsed={parsed} />;
    case "gs1":
      return (
        <FieldList
          fields={parsed.data.fields.map((field) => ({ ...field, mono: true }))}
        />
      );
    case "product":
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              { label: t("number"), value: parsed.code, mono: true },
              ...(parsed.checkDigitValid === false
                ? [{ label: t("checkDigit"), value: t("checkDigitBad") }]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              external
              href={`https://www.google.com/search?q=${encodeURIComponent(parsed.code)}`}
            >
              <Search className="size-3.5" />
              {t("searchWeb")}
            </LinkButton>
            <CopyButton label={t("copyNumber")} value={parsed.code} />
          </div>
        </div>
      );
    case "text":
      return (
        <div className="flex flex-col gap-3">
          <p className="bg-muted/50 max-h-60 overflow-auto rounded-md p-3 text-sm break-words whitespace-pre-wrap">
            {parsed.text}
          </p>
          <div>
            <CopyButton label={t("copyText")} value={parsed.text} />
          </div>
        </div>
      );
  }
}

export function ResultCard({
  value,
  format,
}: {
  value: string;
  format: string;
}) {
  const t = useTranslations("scanner");
  const parsed = useMemo(() => parseScan(value, format), [value, format]);
  const Icon = KIND_ICONS[parsed.kind];
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border bg-background p-4 md:p-5">
      <header className="flex items-center gap-3">
        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-medium leading-tight">
            {t(`kinds.${parsed.kind}`)}
          </h3>
          <p className="text-muted-foreground text-xs">{formatLabel(format)}</p>
        </div>
      </header>
      <Details parsed={parsed} />
      {parsed.kind !== "text" && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">
            {t("result.raw")}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="bg-muted/50 max-h-48 overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {value}
            </p>
            <div>
              <CopyButton label={t("result.copyRaw")} value={value} />
            </div>
          </div>
        </details>
      )}
    </article>
  );
}
