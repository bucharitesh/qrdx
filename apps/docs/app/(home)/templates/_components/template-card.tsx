import { buttonVariants } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { DemoQr } from "@/components/landing/demo/demo-qr";
import { UseTemplateLink } from "@/components/landing/demo/use-template-link";
import { LandingRender } from "@/components/landing/render";
import { ScaledPreview } from "@/components/landing/scaled-preview";
import { buildDemoContent, type TemplateDemo } from "@/lib/landing/demo";
import { baseUrl } from "@/lib/metadata";

/**
 * One template in the gallery: a phone-frame preview (the dashboard picker's
 * thumbnail, with the demo's sample media), its name, a QR code that opens
 * the demo on a phone, "View demo" and "Use template".
 */
export function TemplateCard({ demo }: { demo: TemplateDemo }) {
  const { template, variant, path } = demo;
  const content = buildDemoContent(template.type, variant.id, {
    thumbnail: true,
  });
  const headingId = `template-${template.type}-${variant.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3"
    >
      {/* The preview has its own links, so it sits under a stretched link
          instead of inside one (nested <a> is invalid HTML). */}
      <div className="relative rounded-[1.75rem] border bg-muted/40 p-1.5 shadow-xs transition-colors has-[a:hover]:border-foreground/20 dark:shadow-none">
        <div aria-hidden inert>
          <ScaledPreview className="aspect-[9/16] rounded-[1.375rem] bg-muted">
            <LandingRender
              content={content}
              context={{
                theme: content.theme,
                mode: "live",
                demo: true,
                pageId: null,
                qrCodeId: null,
              }}
              fill="container"
            />
          </ScaledPreview>
        </div>
        <Link
          aria-label={`View the ${variant.name} demo`}
          className="absolute inset-0 rounded-[1.75rem] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          href={path}
        />
      </div>
      <div className="flex items-start gap-3 px-0.5">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-medium" id={headingId}>
            {variant.name}
          </h3>
          {variant.description && (
            <p className="text-muted-foreground text-xs leading-snug text-pretty">
              {variant.description}
            </p>
          )}
        </div>
        <span
          className="hidden shrink-0 md:block"
          title="Scan to open the demo on your phone"
        >
          <DemoQr
            className="size-14"
            value={new URL(path, baseUrl).toString()}
          />
          <span className="sr-only">
            QR code that opens the {variant.name} demo
          </span>
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={path}
        >
          View demo
        </Link>
        <UseTemplateLink
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "aria-busy:opacity-60",
          )}
          type={template.type}
          variantId={variant.id}
        >
          Use template
        </UseTemplateLink>
      </div>
    </article>
  );
}
