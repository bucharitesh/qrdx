import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { onDemandParams } from "@/lib/static-params";

export const alt = "The QRdx MCP server for AI assistants";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return onDemandParams();
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await requireLocaleParam(params);
  return renderPageOgImage({
    label: "MCP server",
    title: "QR codes from Claude, ChatGPT and Cursor",
    description:
      "A free MCP server for styled QR codes, Wi-Fi, vCard and more.",
    footer: "Free · Open source · No account or API key",
  });
}
