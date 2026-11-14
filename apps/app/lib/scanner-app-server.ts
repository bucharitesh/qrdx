import "server-only";

import type { Locale } from "@repo/i18n/config";
import type { MetadataRoute } from "next";
import { createTranslator } from "next-intl";
import { loadMessages } from "./i18n/messages";
import { scannerManifest } from "./scanner-app";

/** The scanner's manifest in a language (its names come from messages/<locale>.json). */
export async function localizedScannerManifest(
  locale: Locale,
): Promise<MetadataRoute.Manifest> {
  const t = createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: "scan.app",
  });
  return scannerManifest(locale, {
    name: t("name"),
    shortName: t("shortName"),
    description: t("description"),
    cameraShortcut: t("cameraShortcut"),
    imageShortcut: t("imageShortcut"),
  });
}
