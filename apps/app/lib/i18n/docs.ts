// The docs languages and URLs live in @repo/i18n (packages/i18n/docs.ts), so
// QRdx's other apps share them. This path stays for the app's imports and
// adds fumadocs' i18n config, which the package leaves to the app.

import type { Locale } from "@repo/i18n/config";
import { docsI18nOptions } from "@repo/i18n/docs";
import { defineI18n } from "fumadocs-core/i18n";

export * from "@repo/i18n/docs";

/** fumadocs' i18n config for the docs loader (lib/source.ts). */
export const docsI18n = defineI18n<Locale>(docsI18nOptions);
