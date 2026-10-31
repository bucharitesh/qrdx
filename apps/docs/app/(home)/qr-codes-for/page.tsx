import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { industries, placements } from "@/lib/seo-content";
import { HubPage } from "./_components/hub-page";

export const metadata: Metadata = createMetadata({
  title: "QR Codes by Industry: Ideas and Print Sizes",
  description: `QR code ideas for ${industries.items.length} industries, from restaurants and retail to healthcare and construction: which code type to use, print sizes and CTA copy.`,
  path: industries.basePath,
});

export default function IndustriesHubPage() {
  return (
    <HubPage
      collection={industries}
      title="QR codes by industry"
      intro={[
        "A restaurant needs a menu it can edit at 6 pm, a construction site needs safety documents behind a weatherproof sign, and a museum needs audio guides in four languages. The right QR code depends on the job, so each guide below covers one industry: what businesses in it link to, which QRdx code type fits, how big to print, and what to write beside the code.",
        "Static codes from the generators are free and need no account. Dynamic codes and hosted pages can be changed after printing and count every scan, and they keep working on every plan.",
      ]}
      links={[
        {
          href: "/qr-codes-on",
          title: "Browse by placement",
          description: `Business cards, packaging, billboards, receipts and ${placements.items.length - 4} more surfaces, with sizes for each.`,
          cta: "QR codes by placement",
        },
        {
          href: "/qr-code-generator",
          title: "Free generators by type",
          description:
            "Wi-Fi, vCard, UPI, WhatsApp, Google review and more, each with the exact format it encodes.",
          cta: "All QR code generators",
        },
        {
          href: "/docs/dynamic-qr-codes",
          title: "How dynamic codes work",
          description:
            "Short links you can repoint after printing, with scan analytics and no scan limits.",
          cta: "Read the dynamic QR guide",
        },
      ]}
      faqs={[
        {
          question: "Which industries benefit most from QR codes?",
          answer:
            "Any business that prints something a customer holds or walks past: menus, packaging, signs, tickets, labels and direct mail. The return is highest where information changes after printing (menus, prices, schedules, documents), because a dynamic code updates without a reprint.",
        },
        {
          question: "Should a business use static or dynamic QR codes?",
          answer:
            "Use static codes for content that never changes, such as a Wi-Fi login, a payment ID or a contact card, because they are free and work without any service in between. Use dynamic codes for anything printed in volume or kept for months, so you can fix a wrong link, change the destination and measure scans.",
        },
        {
          question: "Do QRdx codes stop working if I cancel?",
          answer:
            "No. Static codes never expire. Dynamic codes keep redirecting on every plan, including after a downgrade, a failed payment or a cancellation, with no ads or interstitial pages. Plan limits only stop you creating new codes.",
        },
      ]}
    />
  );
}
