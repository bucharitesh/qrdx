import { ogSize, renderPageOgImage } from "@/app/og/brand";
import { listTemplateDemos } from "@/lib/landing/demo";

export const alt = "QRdx landing page templates for QR codes";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "Templates",
    title: "Landing page templates for QR codes",
    description: `${listTemplateDemos().length} free templates with live demos: link in bio, business card, menu, coupon, event and more.`,
  });
}
