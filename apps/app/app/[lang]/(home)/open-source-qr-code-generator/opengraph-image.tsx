import { GITHUB_REPO_SLUG } from "@repo/config";
import { ogSize, renderPageOgImage } from "@repo/design-system/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { onDemandParams } from "@/lib/static-params";

export const alt = "QRdx, the open source QR code generator";
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
    label: "Open source",
    title: "Open source QR code generator",
    description:
      "The app is AGPL-3.0, the React library and CLI are MIT. Use qrdx.dev or run your own copy.",
    footer: `github.com/${GITHUB_REPO_SLUG} · Docker or Node.js`,
  });
}
