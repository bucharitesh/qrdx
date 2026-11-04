import { demoPath } from "@/lib/landing/demo-paths";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { encodeQRContent } from "@/utils/qr-content-encoder";

/**
 * What the sample codes hold. Every value is an obvious sample: a QRdx demo
 * page or a qrdx.dev page, an example.com address, a 555-01xx phone number
 * (reserved for fiction in North America) or the sample UPI ID the home
 * gallery uses. Codes for accounts on other services (Instagram, PayPal,
 * Bitcoin and so on) open a QRdx demo page instead, so no scan lands on a
 * stranger's profile or pays a real person.
 */

export interface SampleValue {
  value: string;
  /** The content type the value is drawn as. */
  type: ContentType;
}

const SITE = "https://qrdx.dev";

const encode = (content: QRContentConfig): string => encodeQRContent(content);

/** A qrdx.dev page, opened as a website code. */
export const site = (path: string): SampleValue => ({
  value: `${SITE}${path}`,
  type: "url",
});

/** A hosted-page demo (/templates/<type>/<id>), opened as a website code. */
export const demo = (type: string, id: string): SampleValue =>
  site(demoPath(type, id));

/**
 * A demo page, drawn as a code of another type (e.g. an Instagram code that
 * opens the link-in-bio demo rather than a real profile).
 */
export const demoAs = (
  type: ContentType,
  pageType: string,
  id: string,
): SampleValue => ({ ...demo(pageType, id), type });

/** The QR code generator page of a type, drawn as that type. */
export const generatorAs = (type: ContentType): SampleValue => ({
  ...site(`/qr-code-generator/${type}`),
  type,
});

export const wifi = (ssid: string, password = "sample-only"): SampleValue => ({
  value: encode({ type: "wifi", ssid, password, encryption: "WPA" }),
  type: "wifi",
});

/** Name and email only: each extra field makes the code denser. */
export const vcard = (
  firstName: string,
  lastName: string,
  email: string,
): SampleValue => ({
  value: encode({ type: "vcard", firstName, lastName, email }),
  type: "vcard",
});

export const email = (recipient: string, subject: string): SampleValue => ({
  value: encode({ type: "email", recipient, subject }),
  type: "email",
});

/** 555-0100 to 555-0199 only. */
export const phone = (number: string): SampleValue => ({
  value: encode({ type: "phone", phoneNumber: number }),
  type: "phone",
});

export const sms = (number: string, message: string): SampleValue => ({
  value: encode({ type: "sms", phoneNumber: number, message }),
  type: "sms",
});

export const whatsapp = (number: string, message: string): SampleValue => ({
  value: encode({ type: "whatsapp", phoneNumber: number, message }),
  type: "whatsapp",
});

export const text = (message: string): SampleValue => ({
  value: encode({ type: "text", text: message }),
  type: "text",
});

/** Public places (no one's address), as coordinates for a short link. */
export const PLACES = {
  goldenGatePark: "37.7694,-122.4862",
  hydePark: "51.5073,-0.1657",
  centralPark: "40.7829,-73.9654",
  eiffelTower: "48.8584,2.2945",
  sfCityHall: "37.7793,-122.4193",
} as const;

/** A public place on Google Maps. */
export const place = (name: keyof typeof PLACES): SampleValue => ({
  value: encode({ type: "maps", location: PLACES[name] }),
  type: "maps",
});

/** The home gallery's sample UPI ID, which no bank issues. */
export const upi = (name: string): SampleValue => ({
  value: encode({ type: "upi", upiId: "sample@example", name }),
  type: "upi",
});

/** Phone numbers reserved for fiction (555-0100 to 555-0199). */
export const SAMPLE_PHONES = [
  "+1 415 555 0132",
  "+1 415 555 0147",
  "+1 415 555 0163",
  "+1 415 555 0118",
] as const;
