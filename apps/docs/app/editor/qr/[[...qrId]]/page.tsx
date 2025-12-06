import type { Metadata } from "next";
import Editor from "@/components/editor";
import { getPresetById } from "@/utils/qr-presets";

export const metadata: Metadata = {
  title: "QR Code Editor — QRDX",
  description:
    "Create and customize beautiful QR codes with advanced styling options. Design unique QR codes with custom colors, patterns, logos, and frames.",
};

export default async function EditorPage({
  params,
}: {
  params: Promise<{ qrId: string[] }>;
}) {
  const { qrId } = await params;

  const qrPromise =
    qrId?.length > 0
      ? Promise.resolve(getPresetById(qrId?.[0]) ?? null)
      : Promise.resolve(null);

  return <Editor qrPromise={qrPromise} />;
}
