import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
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
        crumbs={[
          { name: "Home", path: "/" },
          { name: "QR code generators", path: "/qr-code-generator" },
          { name, path: `/qr-code-generator/${content.type}` },
        ]}
        title={getQrTypeTitle(content)}
        intro={content.intro}
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
          <ol className="flex flex-col gap-3">
            {content.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-accent text-xs font-medium">
                  {index + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
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
          <h2 className="text-2xl font-medium tracking-tighter">
            Related QR code generators
          </h2>
          <Link
            href="/qr-code-generator"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            All {QR_TYPE_SLUGS.length} types
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <Link
              key={item.type}
              href={`/qr-code-generator/${item.type}`}
              className="group rounded-xl border border-border bg-accent/50 hover:bg-accent transition-colors p-4 flex flex-col gap-1"
            >
              <span className="flex items-center gap-2 font-medium text-secondary-foreground">
                {item.name} QR code
                <ArrowRight className="ml-auto size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </span>
              <span className="text-sm text-muted-foreground">
                {item.summary}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
