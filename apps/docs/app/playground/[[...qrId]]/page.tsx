import type { Metadata } from "next";
import { getTheme } from "@/actions/qr-themes";
import Editor from "@/components/editor";

export const metadata: Metadata = {
  title: "QR Code Playground — QRDX",
  description:
    "Create and customize beautiful QR codes with advanced styling options. Design unique QR codes with custom colors, patterns, logos, and frames.",
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
