import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTheme } from "@/actions/qr-themes";
import { LazyEditor as Editor } from "@/components/lazy-editor";
import { QRCodeThemeNotFoundError } from "@/types/errors";
import { playgroundMetadata } from "../metadata";

export const metadata: Metadata = playgroundMetadata;

/**
 * A shared theme link, /playground/<themeId>: rendered per request. No
 * loading.tsx covers this route (it lives in (editor)), so an unknown id
 * answers with a real 404 status instead of a streamed 200.
 */
export default async function SharedThemePage({
  params,
}: {
  params: Promise<{ qrId: string[] }>;
}) {
  const { qrId } = await params;

  // Unknown theme ids render a 404 instead of crashing the editor
  const theme = await getTheme(qrId[0] ?? "").catch((error: unknown) => {
    if (error instanceof QRCodeThemeNotFoundError) notFound();
    throw error;
  });

  return <Editor themePromise={Promise.resolve(theme)} />;
}
