import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/sections/tools/faq-list";
import { PrintSizeCalculator } from "@/components/sections/tools/print-size-calculator";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { createMetadata } from "@/lib/metadata";
import {
  DISTANCE_TO_SIZE_RATIO,
  MIN_MODULE_MM,
  QUIET_ZONE_MODULES,
  REFERENCE_MODULES,
} from "@/lib/print-size";

export const metadata: Metadata = createMetadata({
  title: "QR Code Print Size Calculator",
  description:
    "Find the minimum printed size for a QR code from the scanning distance, the data it holds and its error-correction level. Results in mm and inches.",
  path: "/tools/print-size",
});

const faqs = [
  {
    question: "What is the minimum size for a QR code?",
    answer: `It depends on how far away people scan from and how dense the code is. For a short link scanned from about 25 cm, around 2.5 cm (1 inch) is enough. Whatever the distance, keep each module at least ${MIN_MODULE_MM} mm wide so printers and cameras can resolve it.`,
  },
  {
    question: "What is the 10:1 rule for QR codes?",
    answer:
      "A common rule of thumb is that a QR code can be scanned from about ten times its width, so a 10 cm code works from about 1 m. It assumes a fairly simple code; codes with more data need to be printed larger, which is what this calculator adjusts for.",
  },
  {
    question: "Does a logo or higher error correction change the size?",
    answer:
      "Higher error correction adds redundancy, so the same content needs a higher version with more modules, and therefore a larger print. A logo doesn't change the module count, but it hides modules, so use level Q or H when adding one.",
  },
  {
    question: "Does the quiet zone count towards the size?",
    answer: `The code size shown is edge to edge. Scanners also need a blank margin of ${QUIET_ZONE_MODULES} modules on every side, which the second figure includes. QRdx downloads have no margin unless you turn on the quiet zone, so leave that space around the code in your layout.`,
  },
  {
    question: "What resolution should I export for print?",
    answer:
      "Use SVG when you can: it is vector and stays sharp at any size. For PNG, export at least the pixel width shown for 300 DPI, which is the usual minimum for print.",
  },
];

export default function PrintSizePage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
          { name: "Print size calculator", path: "/tools/print-size" },
        ]}
        title="QR code print size calculator"
        intro={[
          "Printed too small, a QR code fails exactly where it matters: on a poster across the room, a sign by the road or a label on a crowded shelf. Enter how far away people will scan from and what the code contains, and the calculator works out the smallest size that will still scan reliably.",
          "It goes beyond the simple distance ÷ 10 rule by accounting for how dense your code is: a long link or a vCard needs more modules than a short URL, so each module, and the whole code, must be printed bigger.",
        ]}
      />

      <section
        aria-label="Print size calculator"
        className="w-full px-6 md:px-10 py-10"
      >
        <PrintSizeCalculator />
      </section>

      <section className="w-full px-6 md:px-10 py-10 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            How the size is calculated
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            <li>
              The content decides the QR version. The calculator picks the
              smallest version (1 to 40) that holds your text at the chosen
              error-correction level, using the same capacity tables as the QRdx
              encoder. Version n is 17 + 4n modules wide.
            </li>
            <li>
              The distance decides the module size. The {DISTANCE_TO_SIZE_RATIO}
              :1 rule of thumb is treated as describing a simple{" "}
              {REFERENCE_MODULES} × {REFERENCE_MODULES} code, so each module
              must be at least distance ÷ (
              {DISTANCE_TO_SIZE_RATIO * REFERENCE_MODULES}), and never less than{" "}
              {MIN_MODULE_MM} mm.
            </li>
            <li>
              Module size × modules per side gives the code size. Adding{" "}
              {QUIET_ZONE_MODULES} blank modules on each side gives the space
              the code needs on the page.
            </li>
          </ol>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-medium tracking-tighter">
            Tips for codes that scan
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            <li>
              Keep the content short. A shorter link means a lower version, so
              the same printed size gives bigger modules.
            </li>
            <li>
              Use dark modules on a light background with strong contrast;
              inverted or pastel codes fail on some scanners.
            </li>
            <li>
              Test the printed code with several phones at the real distance and
              lighting before a large print run.
            </li>
            <li>
              Need a code first? Use the{" "}
              <Link href="/qr-code-generator" className="underline">
                QR code generators
              </Link>{" "}
              or the{" "}
              <Link href="/playground" className="underline">
                full editor
              </Link>
              , then export as SVG for print.
            </li>
          </ul>
        </div>
      </section>

      <FaqList title="QR code size FAQ" faqs={faqs} />
    </main>
  );
}
