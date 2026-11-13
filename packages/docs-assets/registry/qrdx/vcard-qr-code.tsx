"use client";

import { QRCode } from "qrdx";
import type { ComponentProps } from "react";
import { cn } from "@/registry/lib/utils";

/** qrdx style options: colors, gradients, patterns, logo, template. */
export type QrCodeStyle = Omit<ComponentProps<typeof QRCode>, "value" | "size">;

export interface VCardAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface VCardContact {
  firstName: string;
  lastName?: string;
  organization?: string;
  /** Job title. */
  title?: string;
  /** Work phone, ideally in international format (+1 555 0100). */
  phone?: string;
  mobile?: string;
  email?: string;
  /** Website, including https://. */
  url?: string;
  address?: VCardAddress;
  note?: string;
}

/** Escapes text for a vCard 3.0 value. */
function escapeVCard(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/**
 * Builds a vCard 3.0 that phone cameras offer to save as a contact.
 * Empty fields are left out to keep the code small.
 */
export function buildVCard(contact: VCardContact): string {
  const {
    firstName,
    lastName = "",
    organization,
    title,
    phone,
    mobile,
    email,
    url,
    address,
    note,
  } = contact;
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCard(lastName)};${escapeVCard(firstName)};;;`,
    `FN:${escapeVCard(fullName)}`,
  ];
  if (organization) lines.push(`ORG:${escapeVCard(organization)}`);
  if (title) lines.push(`TITLE:${escapeVCard(title)}`);
  if (phone) lines.push(`TEL;TYPE=WORK,VOICE:${escapeVCard(phone)}`);
  if (mobile) lines.push(`TEL;TYPE=CELL:${escapeVCard(mobile)}`);
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`);
  if (url) lines.push(`URL:${escapeVCard(url)}`);
  if (address && Object.values(address).some(Boolean)) {
    const { street, city, region, postalCode, country } = address;
    const parts = [street, city, region, postalCode, country].map((part) =>
      escapeVCard(part ?? ""),
    );
    lines.push(`ADR;TYPE=WORK:;;${parts.join(";")}`);
  }
  if (note) lines.push(`NOTE:${escapeVCard(note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export interface VCardQrCodeProps
  extends Omit<ComponentProps<"figure">, "children"> {
  /** The contact to encode. */
  contact: VCardContact;
  /**
   * Width and height of the code in pixels.
   * @default 200
   */
  size?: number;
  /** qrdx style options for the code. */
  qr?: QrCodeStyle;
  /**
   * Show the name and organization under the code.
   * @default true
   */
  showDetails?: boolean;
}

export function VCardQrCode({
  contact,
  size = 200,
  qr,
  showDetails = true,
  className,
  ...props
}: VCardQrCodeProps) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const role = [contact.title, contact.organization].filter(Boolean).join(", ");

  return (
    <figure
      className={cn("inline-flex flex-col items-center gap-3", className)}
      data-slot="vcard-qr-code"
      {...props}
    >
      <div
        aria-label={`QR code with the contact card for ${name}`}
        className="overflow-hidden rounded-[10px] border"
        role="img"
        style={{ width: size, height: size }}
      >
        {/* vCards are long: level "M" keeps the modules large enough to scan. */}
        <QRCode
          level="M"
          margin={2}
          {...qr}
          size={size}
          value={buildVCard(contact)}
        />
      </div>
      {showDetails ? (
        <figcaption className="flex flex-col items-center gap-0.5 text-center text-sm">
          <span className="font-medium">{name}</span>
          {role ? <span className="text-muted-foreground">{role}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
