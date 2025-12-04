import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTheme } from "@/actions/qr-themes";
import Editor from "@/components/editor";
import type { QRPreset } from "@/types/qr";
import { getPresetById } from "@/utils/qr-presets";

export const metadata: Metadata = {
  title: "QR Code Editor — QRDX",
  description:
    "Create and customize beautiful QR codes with advanced styling options. Design unique QR codes with custom colors, patterns, logos, and frames.",
};

interface QREditorPageProps {
  params: Promise<{ qrId?: string[] }>;
  searchParams: Promise<{ preset?: string }>;
}

export default async function QREditorPage({
  params,
  searchParams,
}: QREditorPageProps) {
  const { qrId } = await params;
  const { preset: presetParam } = await searchParams;

  let qrPromise: Promise<QRPreset | null> = Promise.resolve(null);

  // Priority 1: Load saved QR theme from database (if qrId provided)
  if (qrId && qrId.length > 0) {
    const themeId = qrId[0];
    try {
      qrPromise = getTheme(themeId).then((theme) => {
        if (!theme) return null;
        return {
          id: theme.id,
          name: theme.name,
          description: theme.description || "",
          source: "SAVED" as const,
          createdAt: theme.createdAt.toISOString(),
          style: theme.style,
        };
      });
    } catch (error) {
      console.error("Failed to load QR theme:", error);
      notFound();
    }
  }
  // Priority 2: Load built-in preset (if preset param provided)
  else if (presetParam) {
    const builtInPreset = getPresetById(presetParam);
    if (builtInPreset) {
      qrPromise = Promise.resolve(builtInPreset);
    }
  }

  return <Editor qrPromise={qrPromise} />;
}
