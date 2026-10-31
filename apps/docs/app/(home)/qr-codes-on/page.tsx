import type { Metadata } from "next";
import { HubPage } from "@/app/(home)/qr-codes-for/_components/hub-page";
import { createMetadata } from "@/lib/metadata";
import { industries, placements } from "@/lib/seo-content";

export const metadata: Metadata = createMetadata({
  title: "Where to Put QR Codes: Sizes for Every Placement",
  description: `QR codes on business cards, packaging, menus, billboards, receipts and ${placements.items.length - 5} more placements: what to link to, how big to print and where to place them.`,
  path: placements.basePath,
});

export default function PlacementsHubPage() {
  return (
    <HubPage
      collection={placements}
      title="QR codes by placement"
      intro={[
        "Where a QR code goes decides almost everything about it: how big it must be, what material it needs and how long it has to keep working. A receipt code is scanned from 30 cm and thrown away the same day; a sign on a building is read from metres away for years. Each guide below covers one surface, with a size table for the distances people actually scan from.",
        "Sizes are calculated with the same formula as the QRdx print size calculator, for a dynamic short link at error correction Q. Static codes with more data inside need to be larger.",
      ]}
      links={[
        {
          href: "/qr-codes-for",
          title: "Browse by industry",
          description: `Restaurants, retail, real estate, healthcare and ${industries.items.length - 4} more industries, with the code types each one uses.`,
          cta: "QR codes by industry",
        },
        {
          href: "/tools/print-size",
          title: "Print size calculator",
          description:
            "The minimum size for your exact content, distance and error-correction level.",
          cta: "Calculate your size",
        },
        {
          href: "/tools/scan-checker",
          title: "Scan checker",
          description:
            "Upload your design to decode it and check contrast, quiet zone and module size before printing.",
          cta: "Check a QR code",
        },
      ]}
      faqs={[
        {
          question: "How big should a QR code be?",
          answer:
            "About a tenth of the distance it is scanned from, a little more for denser codes: roughly 2.5 to 3 cm for a card held in the hand, 23 cm for a poster 2 m away and about 70 cm for a sign 6 m away. Keep each module at least 0.4 mm and leave a blank margin of four modules around the code.",
        },
        {
          question: "What makes a printed QR code fail to scan?",
          answer:
            "The usual causes are low contrast (pale or inverted colours), a missing quiet zone, printing too small for the distance, glare from glossy finishes, and placement on curves, folds or seams. Test the printed proof, not just the file.",
        },
        {
          question: "Which file format should I send to the printer?",
          answer:
            "Vector: SVG or a print-ready CMYK PDF, both free from QRdx. Vectors stay sharp at any size, from a 2 cm label to a 2 m banner.",
        },
      ]}
    />
  );
}
