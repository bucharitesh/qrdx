import { notFound, permanentRedirect } from "next/navigation";
import { gallerySectionPath } from "@/lib/landing/demo-paths";
import { getTemplate, listTemplates } from "@/lib/landing/templates";
import { buildTimeParams } from "@/lib/static-params";

// /templates/<type> has no page of its own: send it to that type's section
// of the gallery.

type Props = { params: Promise<{ type: string }> };

// Unknown types render notFound() below (lib/static-params.ts).
export function generateStaticParams() {
  return buildTimeParams(() =>
    listTemplates().map((template) => ({ type: template.type })),
  );
}

export default async function TemplateTypePage({ params }: Props) {
  const { type } = await params;
  if (!getTemplate(type)) notFound();
  permanentRedirect(gallerySectionPath(type));
}
