import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoBar } from "@/components/landing/demo/demo-bar";
import { LandingPageFooter } from "@/components/landing/page-footer";
import { LandingRender } from "@/components/landing/render";
import {
  buildDemoContent,
  getTemplateDemo,
  listTemplateDemos,
  pageTypePhrase,
} from "@/lib/landing/demo";
import { TEMPLATES_PATH } from "@/lib/landing/demo-paths";
import { baseUrl, createMetadata } from "@/lib/metadata";

// Public demo of one hosted-page template, rendered with the same components
// as a published page (/p/<slug>) from the template definition alone: no
// database, no QRdx analytics (components/landing/customer-page-paths.ts),
// and nothing sent or recorded (BlockRenderContext.demo).

type Props = { params: Promise<{ type: string; template: string }> };

// Unknown types/templates render notFound() below.
// Event templates start "a week from today"; rebuild daily so they stay ahead.
export const revalidate = 86400;

export function generateStaticParams() {
  return listTemplateDemos().map(({ template, variant }) => ({
    type: template.type,
    template: variant.id,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, template } = await params;
  const demo = getTemplateDemo(type, template);
  if (!demo) return { title: "Template not found", robots: { index: false } };

  const phrase = pageTypePhrase(demo.template.label);
  const title = `${demo.variant.name} template, ${phrase} page`;
  const description = [
    demo.variant.description,
    `A live demo of a QRdx ${phrase} page. Use it as your starting point and change every block.`,
  ]
    .filter(Boolean)
    .join(". ");
  return createMetadata({
    title,
    description,
    // Samples, not content of their own: the gallery is the page to index.
    path: TEMPLATES_PATH,
    robots: { index: false, follow: true },
    openGraph: { url: new URL(demo.path, baseUrl).toString() },
  });
}

export default async function TemplateDemoPage({ params }: Props) {
  const { type, template } = await params;
  const demo = getTemplateDemo(type, template);
  if (!demo) notFound();
  const content = buildDemoContent(type, template);

  return (
    <>
      <DemoBar
        templateName={demo.variant.name}
        type={type}
        variantId={template}
      />
      <LandingRender
        content={content}
        context={{
          theme: content.theme,
          mode: "live",
          demo: true,
          pageId: null,
          qrCodeId: null,
        }}
        footer={
          <LandingPageFooter
            badge
            badgeHref={new URL("/?ref=template-demo", baseUrl).href}
            reportHref={new URL("/report-abuse", baseUrl).href}
          />
        }
      />
    </>
  );
}
