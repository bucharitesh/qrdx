import { buttonVariants } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { DemoQrButton } from "@/components/landing/demo/demo-qr-button";
import { UseTemplateLink } from "@/components/landing/demo/use-template-link";
import {
  PhoneFrame,
  TemplatePreview,
} from "@/components/landing/template-preview";
import { buildDemoContent, type TemplateDemo } from "@/lib/landing/demo";
import { baseUrl } from "@/lib/metadata";

/**
 * One template in the gallery: a live preview in a phone frame (the same
 * thumbnail the dashboard's template picker shows), its name, a QR code that
 * opens the demo on a phone, "View demo" and "Use template".
 */
export function TemplateCard({
  demo,
  className,
}: {
  demo: TemplateDemo;
  className?: string;
}) {
  const { template, variant, path } = demo;
  const content = buildDemoContent(template.type, variant.id, {
    thumbnail: true,
  });
  const headingId = `template-${template.type}-${variant.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn("group/card flex min-w-0 flex-col gap-4", className)}
    >
      {/* The preview has links of its own, so it sits under a stretched link
          instead of inside one (nested <a> is invalid HTML). */}
      <div className="relative">
        <PhoneFrame className="transition-[transform,box-shadow] duration-300 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-[0_28px_50px_-30px_rgb(0_0_0/0.45)] motion-reduce:transition-none motion-reduce:group-hover/card:translate-y-0">
          <TemplatePreview className="aspect-[9/16] w-full" content={content} />
        </PhoneFrame>
        <Link
          aria-label={`View the ${variant.name} demo`}
          className="absolute inset-0 z-10 rounded-[2.25rem] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href={path}
        />
        <DemoQrButton
          name={variant.name}
          url={new URL(path, baseUrl).toString()}
        />
      </div>
      <div className="space-y-1 px-1">
        <h3 className="text-[15px] font-medium tracking-tight" id={headingId}>
          {variant.name}
        </h3>
        {variant.description && (
          <p className="text-muted-foreground line-clamp-2 text-[13px] leading-snug text-pretty">
            {variant.description}
          </p>
        )}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 px-1">
        <Link
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "rounded-full",
          )}
          href={path}
        >
          View demo
        </Link>
        <UseTemplateLink
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "group/use rounded-full border-foreground bg-foreground text-background hover:bg-foreground/85 hover:text-background aria-busy:opacity-60 dark:border-foreground dark:bg-foreground dark:hover:bg-foreground/85",
          )}
          type={template.type}
          variantId={variant.id}
        >
          Use template
          <ArrowRight
            aria-hidden
            className="hidden size-3.5 transition-transform duration-200 group-hover/use:translate-x-0.5 sm:block"
          />
        </UseTemplateLink>
      </div>
    </article>
  );
}
