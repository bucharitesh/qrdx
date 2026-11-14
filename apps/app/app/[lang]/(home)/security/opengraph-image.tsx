import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { requireLocaleParam } from "@/lib/i18n/static-params";
import { onDemandParams } from "@/lib/static-params";

export const alt = "Security at QRdx";
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
    label: "Security",
    title: "Security at QRdx",
    description:
      "Passkeys, two-step verification, single sign-on, an audit log, link checks and where your data is stored.",
  });
}
