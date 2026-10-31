import { Ruler, TableDocument } from "iconsax-reactjs";
import type { Metadata } from "next";
import { MockupImage } from "@/components/mockups/mockup-image";
import { qrTypeGroupImages } from "@/components/mockups/visuals";
import { SectionHeader } from "@/components/sections/section-header";
import { CardGrid, LinkCard } from "@/components/sections/tools/cards";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { QR_TYPE_ICONS } from "@/components/sections/tools/topic-icons";
import { createMetadata } from "@/lib/metadata";
import { QR_TYPE_GROUPS, QR_TYPES } from "@/lib/qr-types-content";

const title = "Free QR Code Generators for Every Type";
const description = `${QR_TYPES.length} free QR code generators: Wi-Fi, vCard, WhatsApp, UPI, email, social profiles, payments and more. Each explains the exact payload format. No signup.`;

export const metadata: Metadata = createMetadata({
  title,
  description,
  path: "/qr-code-generator",
});

export default function QrTypesHubPage() {
  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: "Home", path: "/" },
          { name: "QR code generators", path: "/qr-code-generator" },
        ]}
        title="QR code generators for every type of content"
        intro={[
          `A QR code can do more than open a website. Depending on the text inside it, a phone can join a Wi-Fi network, save a contact, start a payment or open a chat. Pick one of the ${QR_TYPES.length} types below for a generator with the right fields, a live preview and PNG or SVG download.`,
          "By default the codes made on these pages are static: the content is encoded in the pattern itself, so they work offline, never expire and have no scan limit. Each page also documents the exact format it writes, so you know what a scanner will read.",
        ]}
      />

      {QR_TYPE_GROUPS.map((group) => {
        const items = QR_TYPES.filter((item) => item.group === group.id);
        if (items.length === 0) return null;

        return (
          <section
            key={group.id}
            aria-labelledby={`group-${group.id}`}
            className="flex flex-col items-center w-full"
          >
            <SectionHeader>
              <h2
                id={`group-${group.id}`}
                className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
              >
                {group.title}
              </h2>
              <p className="text-muted-foreground text-center text-balance font-medium text-sm">
                {group.description}
              </p>
            </SectionHeader>
            <div className="w-full px-6 md:px-10 py-10 grid gap-6 lg:grid-cols-3">
              <MockupImage
                {...qrTypeGroupImages[group.id]}
                sizes="(min-width: 1280px) 400px, (min-width: 1024px) 33vw, 100vw"
                className="aspect-[3/2] object-cover lg:sticky lg:top-24 lg:self-start"
              />
              <CardGrid
                count={items.length}
                max={2}
                className="min-w-0 lg:col-span-2"
              >
                {items.map((item) => (
                  <LinkCard
                    key={item.type}
                    href={`/qr-code-generator/${item.type}`}
                    icon={QR_TYPE_ICONS[item.type]}
                    title={`${item.name} QR code generator`}
                    description={item.summary}
                  />
                ))}
              </CardGrid>
            </div>
          </section>
        );
      })}

      <section aria-label="More tools" className="w-full px-6 md:px-10 py-10">
        <CardGrid count={2} max={2}>
          <LinkCard
            href="/tools/bulk"
            icon={TableDocument}
            title="Need hundreds of codes? Use the bulk generator"
            description="Upload a CSV and download every code as PNG or SVG in one ZIP file, generated entirely in your browser."
          />
          <LinkCard
            href="/tools/print-size"
            icon={Ruler}
            title="Printing your code? Check the size"
            description="Work out the minimum printed size from the scanning distance and how much data the code holds."
          />
        </CardGrid>
      </section>
    </main>
  );
}
