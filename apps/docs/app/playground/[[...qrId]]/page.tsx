import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTheme } from "@/actions/qr-themes";
import Editor from "@/components/editor";
import { createMetadata } from "@/lib/metadata";
import { QRCodeThemeNotFoundError } from "@/types/errors";

// Every /playground/<themeId> variant canonicalizes to the main playground.
export const metadata: Metadata = createMetadata({
  title: "QR Code Generator Playground — Free, No Signup",
  description:
    "Create unlimited free QR codes instantly — no signup, no watermarks. Customize colors, dot patterns, logos, and gradients with live preview. Download as PNG, SVG, or JPG.",
  keywords: [
    "free qr code generator",
    "qr code playground",
    "custom qr code maker",
    "qr code no signup",
    "qr code with logo",
  ],
  path: "/playground",
});

export default async function EditorPage({
  params,
}: {
  params: Promise<{ qrId: string[] }>;
}) {
  const { qrId } = await params;
  const themeId = qrId?.[0];

  // Unknown theme ids render a 404 instead of crashing the editor
  const theme = themeId
    ? await getTheme(themeId).catch((error: unknown) => {
        if (error instanceof QRCodeThemeNotFoundError) notFound();
        throw error;
      })
    : null;

  return <Editor themePromise={Promise.resolve(theme)} />;
}
