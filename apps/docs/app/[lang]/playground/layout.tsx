import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/i18n/client-messages";
import { PlaygroundShell } from "@/components/playground/playground-shell";
import { PLAYGROUND_NAMESPACES } from "@/lib/i18n/playground";

// /playground in every language (lib/i18n/localized-paths.json), each one
// prerendered: nothing here reads the request. Shared theme links
// (/playground/<themeId>) stay unprefixed in app/(app)/playground.
export default async function PlaygroundLayout({
  children,
}: LayoutProps<"/[lang]/playground">) {
  const t = await getTranslations("playground");
  return (
    <ClientMessages namespaces={PLAYGROUND_NAMESPACES}>
      <PlaygroundShell heading={t("heading")}>{children}</PlaygroundShell>
    </ClientMessages>
  );
}
