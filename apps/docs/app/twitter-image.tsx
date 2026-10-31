import { renderSiteOgImage } from "@/app/og/brand";
import { defaultOgImage } from "@/lib/metadata";

export const alt = defaultOgImage.alt;
export const size = {
  width: defaultOgImage.width,
  height: defaultOgImage.height,
};
export const contentType = "image/png";

export default function Image() {
  return renderSiteOgImage();
}
