import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  Camera,
  Code,
  Contact,
  Files,
  type LucideIcon,
  Ruler,
  ScanLine,
  Shapes,
  Wifi,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MockupImage } from "@/components/mockups/mockup-image";
import { productShots, type Visual } from "@/components/mockups/visuals";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { createMetadata } from "@/lib/metadata";
import { QR_TYPES } from "@/lib/qr-types-content";

export const metadata: Metadata = createMetadata({
  title: "Free QR Code Tools",
  description:
    "Free QR code tools: bulk generator from CSV, scan checker, print size calculator, Wi-Fi and vCard generators, and a QR image API for developers.",
  path: "/tools",
});

interface Tool {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Screenshot of the tool; tools with one are shown as large cards. */
  image?: Visual;
  /** object-position for the cropped thumbnail. */
  imagePosition?: string;
}

const tools: Tool[] = [
  {
    href: "/scan",
    title: "QR code scanner",
    description:
      "Scan QR codes and barcodes with your camera or an image, with a safe-link preview before you open anything.",
    icon: Camera,
  },
  {
    href: "/tools/bulk",
    title: "Bulk QR code generator",
    description:
      "Upload a CSV and download up to 5,000 styled codes as PNG or SVG in one ZIP, generated in your browser.",
    icon: Files,
    image: productShots.bulkGenerator,
    imagePosition: "object-right-top",
  },
  {
    href: "/tools/scan-checker",
    title: "QR code scan checker",
    description:
      "Upload an image of a QR code to decode it and check how reliably it scans.",
    icon: ScanLine,
    image: productShots.scanChecker,
    imagePosition: "object-[50%_78%]",
  },
  {
    href: "/tools/print-size",
    title: "Print size calculator",
    description:
      "Work out the minimum printed size from scanning distance, data length and error correction.",
    icon: Ruler,
    image: productShots.printSize,
    imagePosition: "object-left-top",
  },
  {
    href: "/qr-code-generator/wifi",
    title: "Wi-Fi QR code generator",
    description:
      "Let guests join your network with one scan instead of typing the password.",
    icon: Wifi,
    image: productShots.wifiGenerator,
    imagePosition: "object-right-top",
  },
  {
    href: "/qr-code-generator/vcard",
    title: "vCard QR code generator",
    description:
      "Put your contact details on a business card that saves straight to the phone.",
    icon: Contact,
  },
  {
    href: "/qr-code-generator",
    title: `All ${QR_TYPES.length} QR code types`,
    description:
      "Generators for WhatsApp, UPI, email, SMS, social profiles, payments and more.",
    icon: Shapes,
  },
  {
    href: "/docs/developers/image-api",
    title: "QR code image API",
    description:
      "Get a QR code image from a URL for READMEs, emails and HTML, with no API key.",
    icon: Code,
  },
];

const featuredTools = tools.filter((tool) => tool.image);
const otherTools = tools.filter((tool) => !tool.image);

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={tool.href}
      className="group rounded-xl border border-border bg-accent/50 hover:bg-accent transition-colors overflow-hidden flex flex-col"
    >
      {tool.image && (
        <div className="aspect-video overflow-hidden border-b border-border bg-background">
          <MockupImage
            {...tool.image}
            bare
            sizes="(min-width: 1280px) 600px, (min-width: 640px) 50vw, 100vw"
            className={cn("h-full object-cover", tool.imagePosition)}
          />
        </div>
      )}
      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <tool.icon className="size-4" />
          </span>
          <span className="font-semibold text-secondary-foreground">
            {tool.title}
          </span>
          <ArrowRight className="ml-auto size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tool.description}
        </p>
      </div>
    </Link>
  );
}

export default function ToolsPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Tools", path: "/tools" },
        ]}
        title="Free QR code tools"
        intro={[
          "Small, focused tools for the jobs around a QR code: making many at once, sizing them for print and checking that they scan. They are free, need no account and run in your browser.",
        ]}
      />

      <section className="w-full px-6 md:px-10 py-10 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {featuredTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {otherTools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </div>
      </section>
    </main>
  );
}
