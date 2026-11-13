import { getTranslations } from "next-intl/server";
import { ClientContent } from "@/components/i18n/client-content";
import { ClientMessages } from "@/components/i18n/client-messages";
import { PlaygroundShell } from "@/components/playground/playground-shell";
import { EDITOR_CONTENT, EDITOR_CONTENT_RULES } from "@/lib/i18n/content-rules";
import { PLAYGROUND_NAMESPACES } from "@/lib/i18n/playground";

// /playground in every language (lib/i18n/localized-paths.json), each one
// static: nothing here reads the request (English is prerendered, the other
// languages are cached after their first request). Shared theme links
// (/playground/<themeId>) stay unprefixed in app/(app)/playground.
export default async function PlaygroundLayout({
  children,
}: LayoutProps<"/[lang]/playground">) {
  const t = await getTranslations("playground");
  return (
    <ClientMessages namespaces={PLAYGROUND_NAMESPACES}>
      <ClientContent data={EDITOR_CONTENT} rules={EDITOR_CONTENT_RULES}>
        <PlaygroundShell heading={t("heading")}>{children}</PlaygroundShell>
      </ClientContent>
    </ClientMessages>
  );
}
