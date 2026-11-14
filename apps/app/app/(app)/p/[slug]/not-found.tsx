import { localizePath } from "@repo/i18n/paths";
import { headers } from "next/headers";
import { negotiateLocale } from "@/lib/i18n/accept-language";
import { scanPagesIntl } from "@/lib/i18n/scan-pages";
import { baseUrl } from "@/lib/metadata";

// A hosted page that doesn't exist (or was removed), seen by someone who
// scanned a code: QRdx's short note in their language, like the /q status
// pages, instead of the site's 404.
export default async function HostedPageNotFound() {
  const locale = negotiateLocale((await headers()).get("accept-language"));
  const { t } = await scanPagesIntl(locale);
  return (
    <main
      className="flex min-h-dvh w-full items-center justify-center bg-background p-6"
      lang={locale}
    >
      <div className="w-full max-w-sm space-y-2 rounded-2xl border bg-card px-7 py-10 text-center">
        <h1 className="text-xl font-semibold text-balance">
          {t("hosted.notFoundTitle")}
        </h1>
        <p className="text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {t("hosted.notFoundMessage")}
        </p>
        <p className="pt-6">
          <a
            className="inline-block rounded-full border px-4 py-2 text-sm font-semibold"
            href={new URL(localizePath("/", locale), baseUrl).href}
          >
            {t("status.makeYourOwn")}
          </a>
        </p>
      </div>
    </main>
  );
}
