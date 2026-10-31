import { notFound, permanentRedirect } from "next/navigation";
import { gallerySectionPath } from "@/lib/landing/demo-paths";
import { getTemplate, listTemplates } from "@/lib/landing/templates";

// /templates/<type> has no page of its own: send it to that type's section
// of the gallery.

type Props = { params: Promise<{ type: string }> };

export function generateStaticParams() {
  return listTemplates().map((template) => ({ type: template.type }));
}

export default async function TemplateTypePage({ params }: Props) {
  const { type } = await params;
  if (!getTemplate(type)) notFound();
  permanentRedirect(gallerySectionPath(type));
}
