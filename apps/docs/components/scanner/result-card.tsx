"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Barcode,
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
import { useMemo, useState } from "react";
import { OpenButton } from "./confirm-open";
import { formatLabel } from "./detector";
import { downloadText, fileSlug } from "./download";
import { LinkPreview } from "./link-preview";
import {
  type CalendarEvent,
  KIND_LABELS,
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
};

const COPY_LABELS: Record<PaymentScheme, string> = {
  upi: "Copy UPI ID",
  bitcoin: "Copy address",
  ethereum: "Copy address",
  paypal: "Copy link",
  venmo: "Copy username",
  epc: "Copy IBAN",
};

/** mailto: address part, percent-encoded except the characters addresses need. */
function mailtoAddress(value: string): string {
  return encodeURIComponent(value).replace(/%40/g, "@").replace(/%2C/gi, ",");
}

function formatWhen(value: string | undefined, allDay: boolean): string | null {
  if (!value) return null;
  const date = new Date(allDay ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return allDay
    ? date.toLocaleDateString(undefined, { dateStyle: "full" })
    : date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

function eventFields(event: CalendarEvent) {
  const start = formatWhen(event.start, event.allDay);
  const end = formatWhen(event.end, event.allDay);
  return [
    start && { label: "Starts", value: start },
    end && { label: "Ends", value: end },
    event.location && { label: "Where", value: event.location },
    event.description && { label: "Details", value: event.description },
  ].filter((field): field is { label: string; value: string } =>
    Boolean(field),
  );
}

function WifiDetails({
  parsed,
}: {
  parsed: Extract<ParsedScan, { kind: "wifi" }>;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <FieldList
        fields={[
          { label: "Network (SSID)", value: parsed.ssid },
          { label: "Security", value: parsed.security },
          ...(parsed.hidden ? [{ label: "Hidden network", value: "Yes" }] : []),
          ...(parsed.password
            ? [
                {
                  label: "Password",
                  mono: true,
                  value: (
                    <span className="inline-flex items-center gap-2">
                      <span>
                        {revealed
                          ? parsed.password
                          : "•".repeat(Math.min(parsed.password.length, 16))}
                      </span>
                      <button
                        aria-label={
                          revealed ? "Hide password" : "Show password"
                        }
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
          <CopyButton label="Copy password" value={parsed.password} />
        )}
        <CopyButton label="Copy network name" value={parsed.ssid} />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Browsers aren't allowed to join Wi-Fi networks for you. Copy the
        password, open your Wi-Fi settings and choose “{parsed.ssid}”. Your
        phone's own camera app can usually join in one tap.
      </p>
    </div>
  );
}

function PaymentDetails({
  parsed,
}: {
  parsed: Extract<ParsedScan, { kind: "payment" }>;
}) {
  const name = PAYMENT_NAMES[parsed.scheme];
  const confirm = {
    title: `Open ${name} to pay ${parsed.payee}?`,
    description: (
      <>
        <p>
          You're about to hand this payment to your {name} app
          {parsed.amount ? ` for ${parsed.amount}` : ""}. QR codes on stickers
          and posters are sometimes swapped by scammers.
        </p>
        <p>Check the payee and amount in the app before you confirm.</p>
      </>
    ),
    action: `Open ${name}`,
  };
  return (
    <div className="flex flex-col gap-3">
      <FieldList
        fields={parsed.fields.map((field) => ({
          ...field,
          mono: /address|iban|upi id|recipient|contract/i.test(field.label),
        }))}
      />
      {parsed.openUrl && /^https:/i.test(parsed.openUrl) ? (
        <LinkPreview
          confirm={confirm}
          openLabel={`Pay with ${name}`}
          url={parsed.openUrl}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {parsed.openUrl && (
            <OpenButton confirm={confirm} href={parsed.openUrl}>
              <Wallet className="size-3.5" />
              Pay with {name}
            </OpenButton>
          )}
          <CopyButton
            label={COPY_LABELS[parsed.scheme]}
            value={parsed.copyValue}
          />
        </div>
      )}
      {parsed.scheme === "epc" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Banking apps in the euro area can scan this code directly. You can
          also copy the IBAN into a new transfer.
        </p>
      )}
      {parsed.scheme === "upi" && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Opens a UPI app (Google Pay, PhonePe, Paytm, BHIM…) on phones that
          have one.
        </p>
      )}
    </div>
  );
}

function Details({ parsed }: { parsed: ParsedScan }) {
  switch (parsed.kind) {
    case "url":
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
        </div>
      );
    case "wifi":
      return <WifiDetails parsed={parsed} />;
    case "contact": {
      const { contact } = parsed;
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              { label: "Name", value: contact.name },
              ...(contact.organization
                ? [{ label: "Organization", value: contact.organization }]
                : []),
              ...(contact.title
                ? [{ label: "Title", value: contact.title }]
                : []),
              ...contact.phones.map((phone, index) => ({
                label: index === 0 ? "Phone" : `Phone ${index + 1}`,
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
                label: index === 0 ? "Email" : `Email ${index + 1}`,
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
                label: index === 0 ? "Website" : `Website ${index + 1}`,
                value: url,
                mono: true,
              })),
              ...(contact.address
                ? [{ label: "Address", value: contact.address }]
                : []),
              ...(contact.note ? [{ label: "Note", value: contact.note }] : []),
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
              Save contact (.vcf)
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
              { label: "Event", value: parsed.event.summary },
              ...eventFields(parsed.event),
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
              Add to calendar (.ics)
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
                ? [{ label: "Place", value: parsed.label }]
                : []),
              {
                label: "Coordinates",
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
            <CopyButton label="Copy coordinates" value={coords} />
          </div>
        </div>
      );
    }
    case "phone":
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[{ label: "Number", value: parsed.number, mono: true }]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`tel:${parsed.number.replace(/[^\d+*#,;]/g, "")}`}
            >
              <Phone className="size-3.5" />
              Call
            </LinkButton>
            <CopyButton label="Copy number" value={parsed.number} />
          </div>
        </div>
      );
    case "sms":
      return (
        <div className="flex flex-col gap-3">
          <FieldList
            fields={[
              ...(parsed.number
                ? [{ label: "To", value: parsed.number, mono: true }]
                : []),
              ...(parsed.body
                ? [{ label: "Message", value: parsed.body }]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`sms:${parsed.number.replace(/[^\d+*#]/g, "")}${parsed.body ? `?body=${encodeURIComponent(parsed.body)}` : ""}`}
            >
              <MessageSquare className="size-3.5" />
              Write text
            </LinkButton>
            {parsed.number && (
              <CopyButton label="Copy number" value={parsed.number} />
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Your messaging app opens with the text filled in. Nothing is sent
            until you press send.
          </p>
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
              { label: "To", value: parsed.to, mono: true },
              ...(parsed.subject
                ? [{ label: "Subject", value: parsed.subject }]
                : []),
              ...(parsed.body
                ? [{ label: "Message", value: parsed.body }]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`mailto:${mailtoAddress(parsed.to)}${search ? `?${search}` : ""}`}
            >
              <Mail className="size-3.5" />
              Write email
            </LinkButton>
            <CopyButton label="Copy address" value={parsed.to} />
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
              { label: "Number", value: parsed.code, mono: true },
              ...(parsed.checkDigitValid === false
                ? [
                    {
                      label: "Check digit",
                      value:
                        "Doesn't match. The code may have been misread; scan it again.",
                    },
                  ]
                : []),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              external
              href={`https://www.google.com/search?q=${encodeURIComponent(parsed.code)}`}
            >
              <Search className="size-3.5" />
              Search the web
            </LinkButton>
            <CopyButton label="Copy number" value={parsed.code} />
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
            <CopyButton label="Copy text" value={parsed.text} />
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
            {KIND_LABELS[parsed.kind]}
          </h3>
          <p className="text-muted-foreground text-xs">{formatLabel(format)}</p>
        </div>
      </header>
      <Details parsed={parsed} />
      {parsed.kind !== "text" && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">
            Raw content
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="bg-muted/50 max-h-48 overflow-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {value}
            </p>
            <div>
              <CopyButton label="Copy raw content" value={value} />
            </div>
          </div>
        </details>
      )}
    </article>
  );
}
