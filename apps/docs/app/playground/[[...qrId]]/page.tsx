import type { Metadata } from "next";
import { getTheme } from "@/actions/qr-themes";
import Editor from "@/components/editor";

export const metadata: Metadata = {
  title: "Free QR Code Generator Playground | QRdx — No Signup Required",
  description:
    "Create unlimited free QR codes instantly — no signup, no watermarks. Customize colors, dot patterns, logos, and gradients with live preview. Download as PNG, SVG, or JPG.",
  keywords:
    "free qr code generator, qr code playground, custom qr code maker, qr code no signup, unlimited qr codes online",
  openGraph: {
    title: "Free QR Code Generator Playground | QRdx",
    description:
      "Create unlimited free QR codes with no signup required. Custom colors, logos, 29 dot patterns, and live preview.",
    url: "https://qrdx.dev/playground",
  },
};

export default async function EditorPage({
  params,
}: {
  params: Promise<{ qrId: string[] }>;
}) {
  const { qrId } = await params;

  const themePromise =
    qrId?.length > 0 ? getTheme(qrId?.[0]) : Promise.resolve(null);

  return <Editor themePromise={themePromise} />;
}
