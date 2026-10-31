import type { Metadata } from "next";
import { BulkGenerator } from "@/components/sections/tools/bulk-generator";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Free Bulk QR Code Generator from CSV",
  description:
    "Generate up to 5,000 QR codes from a CSV file and download them as PNG or SVG in one ZIP. Custom styles and file names. Runs entirely in your browser.",
  path: "/tools/bulk",
});

const steps = [
  {
    title: "Prepare a CSV",
    body: "One row per QR code. Put the content (a link, Wi-Fi string, phone number or any text) in one column and, optionally, the file name you want in another. Download the sample CSV to see the layout.",
  },
  {
    title: "Map the columns",
    body: "Pick which column holds the QR content and which one names the files. Without a file-name column, codes are numbered qr-0001, qr-0002 and so on, in row order.",
  },
  {
    title: "Pick a style and format",
    body: "Choose a built-in preset, the style you last used in the editor, or one of your saved themes when you're signed in. SVG is best for print; PNG for screens and documents.",
  },
  {
    title: "Generate and download",
    body: "Codes are rendered one batch at a time with a progress bar, then packed into a single ZIP file. Rows that can't be encoded are skipped and listed in errors.csv inside the ZIP.",
  },
];

const faqs = [
  {
    question: "Is my CSV uploaded anywhere?",
    answer:
      "No. The file is read, the QR codes are drawn and the ZIP is built in your browser. Nothing is sent to QRdx's servers, so it's safe for internal links, Wi-Fi passwords or customer data.",
  },
  {
    question: "How many QR codes can I generate at once?",
    answer:
      "Up to 5,000 rows per file. For more, split the CSV into several files. Large PNG sizes take longer and use more memory, so choose 512 px unless you need bigger images.",
  },
  {
    question: "What can each row contain?",
    answer:
      "Any text up to the QR code limit: links, plain text, or payloads such as WIFI:..., mailto:..., tel:... and BEGIN:VCARD. The content is encoded exactly as it appears in the cell.",
  },
  {
    question: "Are the generated codes static or dynamic?",
    answer:
      "Static. Each code contains its row's content directly, works offline, never expires and can't be edited after printing. For editable codes with scan statistics, create dynamic codes from your QRdx dashboard.",
  },
  {
    question: "What happens with duplicate or invalid file names?",
    answer:
      "Characters that aren't allowed in file names are replaced with a hyphen, and duplicate names get a number suffix (menu.png, menu-2.png) so no file is overwritten.",
  },
];

export default function BulkPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
          { name: "Bulk generator", path: "/tools/bulk" },
        ]}
        title="Bulk QR code generator"
        intro={[
          "Turn a spreadsheet into hundreds or thousands of QR codes in one go: product labels, event tickets, asset tags, table numbers or personalised mailers. Upload a CSV, map the columns, choose a style and download every code as PNG or SVG in a single ZIP file.",
          "Everything happens in your browser. The CSV is never uploaded and there is no sign-up, watermark or per-code charge.",
        ]}
      />

      <section
        aria-label="Bulk QR code generator"
        className="w-full px-6 md:px-10 py-10"
      >
        <BulkGenerator />
      </section>

      <section className="w-full px-6 md:px-10 py-10 flex flex-col gap-6">
        <h2 className="text-2xl font-medium tracking-tighter">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-xl border border-border bg-accent/50 p-4"
            >
              <span className="text-xs font-medium text-muted-foreground">
                Step {index + 1}
              </span>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <FaqList title="Bulk QR code FAQ" faqs={faqs} />
    </main>
  );
}
