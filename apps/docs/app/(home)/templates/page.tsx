import type { Metadata } from "next";
import { IconTile } from "@/components/sections/tools/cards";
import { FaqList } from "@/components/sections/tools/faq-list";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { listTemplateDemos } from "@/lib/landing/demo";
import { TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import { listTemplates } from "@/lib/landing/templates";
import { createMetadata } from "@/lib/metadata";
import { TemplateCard } from "./_components/template-card";

// Public gallery of every hosted-page template, grouped by page type, each
// with a live demo (/templates/<type>/<id>). Built from the template
// registry; no database.

// Event previews start "a week from today"; rebuild daily.
export const revalidate = 86400;

const demos = listTemplateDemos();

export const metadata: Metadata = createMetadata({
  title: "QR Code Landing Page Templates with Live Demos",
  description: `${demos.length} free mobile page templates for QR codes: link in bio, business card, menu, coupon, event, feedback form, PDF, gallery, audio and video. Open a live demo, then edit every block.`,
  path: TEMPLATES_PATH,
});

const faqs = [
  {
    question: "Are the templates free?",
    answer:
      "Yes. Every template is free to use. The Free plan includes 3 hosted pages; Pro and Business have no page limit.",
  },
  {
    question: "Can I change the page after I print the QR code?",
    answer:
      "Yes. Each page gets a dynamic QR code that always opens the same short link, so you can change blocks, colors and text at any time without reprinting.",
  },
  {
    question: "Do I need a website?",
    answer:
      "No. QRdx hosts the page for you on a short link. Pro and Business can also use their own domain.",
  },
  {
    question: "Do the demos collect any data?",
    answer:
      "No. Forms on a demo show the thank-you message without sending anything, and demos record no views or clicks. On your own page, form responses go to your dashboard.",
  },
];

export default function TemplatesPage() {
  const types = listTemplates();

  return (
    <main className="flex min-h-screen w-full flex-col divide-y divide-border">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Templates", path: TEMPLATES_PATH },
        ]}
        intro={[
          "Every hosted page starts from a template. Open a live demo or scan it with your phone, then make it yours: change every block, color and word.",
          "Each page comes with a dynamic QR code, so you can keep editing after you print.",
        ]}
        title="Page templates for your QR codes"
      >
        <nav
          aria-label="Page types"
          className="flex flex-wrap justify-center gap-1.5"
        >
          {types.map((template) => (
            <a
              className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              href={`#${template.type}`}
              key={template.type}
            >
              {template.label}
            </a>
          ))}
        </nav>
      </ToolHero>

      {types.map((template) => {
        const items = demos.filter(
          (demo) => demo.template.type === template.type,
        );
        const headingId = `${template.type}-heading`;
        return (
          <section
            aria-labelledby={headingId}
            className="flex w-full scroll-mt-14 flex-col"
            id={template.type}
            key={template.type}
          >
            <div className="flex items-start gap-3.5 border-b px-6 py-6 md:px-10">
              <IconTile icon={template.icon} />
              <div className="min-w-0 flex-1 space-y-1">
                <h2
                  className="text-xl font-medium tracking-tight text-balance"
                  id={headingId}
                >
                  {template.label} templates
                </h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  {template.description}
                </p>
              </div>
              <span className="text-muted-foreground hidden shrink-0 pt-1 text-xs tabular-nums sm:block">
                {items.length} {items.length === 1 ? "template" : "templates"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 px-6 py-8 md:grid-cols-3 md:gap-x-6 md:px-10 xl:grid-cols-4">
              {items.map((demo) => (
                <TemplateCard demo={demo} key={demo.path} />
              ))}
            </div>
          </section>
        );
      })}

      <FaqList faqs={faqs} title="Template questions" />
    </main>
  );
}
