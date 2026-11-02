import { ogSize, renderPageOgImage } from "@/app/og/brand";

export const alt = "The QRdx MCP server for AI assistants";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return renderPageOgImage({
    label: "MCP server",
    title: "QR codes from Claude, ChatGPT and Cursor",
    description:
      "A free MCP server for styled QR codes, Wi-Fi, vCard and more.",
    footer: "Free · Open source · No account or API key",
  });
}
