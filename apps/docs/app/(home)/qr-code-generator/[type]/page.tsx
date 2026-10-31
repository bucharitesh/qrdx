import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockupImage } from "@/components/mockups/mockup-image";
import { qrTypeGroupImages } from "@/components/mockups/visuals";
import {
  CardGrid,
  LinkCard,
  SectionLink,
} from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { QR_TYPE_ICONS } from "@/components/sections/tools/topic-icons";
import { TypeGenerator } from "@/components/sections/tools/type-generator";
import { createMetadata } from "@/lib/metadata";
import {
  getQrType,
  getQrTypeTitle,
  QR_TYPE_SLUGS,
} from "@/lib/qr-types-content";

interface PageProps {
  params: Promise<{ type: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return QR_TYPE_SLUGS.map((type) => ({ type }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { type } = await params;
  const content = getQrType(type);
  if (!content) notFound();

  return createMetadata({
    title: getQrTypeTitle(content),
    description: content.metaDescription,
    path: `/qr-code-generator/${content.type}`,
  });
}

export default async function QrTypePage({ params }: PageProps) {
  const { type } = await params;
  const content = getQrType(type);
  if (!content) notFound();

  const { name, payload } = content;
  const related = content.related
    .map((slug) => getQrType(slug))
    .filter((item) => item !== undefined);

  return (
    <main className="flex flex-col divide-y divide-border min-h-screen w-full">
      <ToolHero
        pattern="qr"
        crumbs={[
          { name: "Home", path: "/" },
          { name: "QR code generators", path: "/qr-code-generator" },
          { name, path: `/qr-code-generator/${content.type}` },
        ]}
        title={getQrTypeTitle(content)}
        intro={[content.intro[0]]}
      />

      <section
        id="generator"
        aria-label={`${name} QR code generator`}
        className="w-full px-6 md:px-10 py-10"
      >
        <TypeGenerator key={content.type} type={content.type} />
      </section>

      <section className="grid w-full md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-6 md:px-10 py-10 flex flex-col gap-4">
          <h2 className="text-2xl font-medium tracking-tighter">
            How to create a {name} QR code
          </h2>
          {/* The hero keeps one paragraph so the generator sits above the fold. */}
          <p className="text-muted-foreground leading-relaxed text-pretty">
            {content.intro[1]}
          </p>
          <ol className="flex flex-col gap-3">
            {content.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs text-foreground/80">
                  {index + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
          <MockupImage
            {...qrTypeGroupImages[content.group]}
            sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
            className="mt-2 aspect-[3/2] object-cover"
          />
        </div>

        <div className="px-6 md:px-10 py-10 flex flex-col gap-4 min-w-0">
          <h2 className="text-2xl font-medium tracking-tighter">
            {name} QR code format
          </h2>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Format
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{payload.format}</code>
            </pre>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Example
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
              <code>{payload.example}</code>
            </pre>
          </div>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground leading-relaxed">
            {payload.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>

      <FaqList title={`${name} QR code FAQ`} faqs={content.faqs} />

      <section className="w-full px-6 md:px-10 py-10 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            Related QR code generators
          </h2>
          <SectionLink href="/qr-code-generator">
            All {QR_TYPE_SLUGS.length} types
          </SectionLink>
        </div>
        <CardGrid count={related.length}>
          {related.map((item) => (
            <LinkCard
              key={item.type}
              href={`/qr-code-generator/${item.type}`}
              icon={QR_TYPE_ICONS[item.type]}
              title={`${item.name} QR code`}
              description={item.summary}
            />
          ))}
        </CardGrid>
      </section>
    </main>
  );
}
