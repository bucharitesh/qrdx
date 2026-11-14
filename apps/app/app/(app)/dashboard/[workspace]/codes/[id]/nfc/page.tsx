import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { NfcGuide } from "@/app/(app)/dashboard/codes/_components/nfc-guide";
import { NfcWritePanel } from "@/app/(app)/dashboard/codes/_components/nfc-write-panel";
import {
  nfcPageHref,
  opensBusinessCard,
} from "@/app/(app)/dashboard/codes/_lib/nfc";
import {
  getCode,
  requireDashboardScope,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { CopyButton } from "@/components/copy-button";
import { HttpError } from "@/lib/error-response";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { baseUrl } from "@/lib/metadata";
import { ndefUrlBytes, nfcLink } from "@/lib/nfc/links";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Use with NFC",
  robots: { index: false, follow: false },
};

/**
 * Write a dynamic code's NFC link to a tag or card (Web NFC on Android, an
 * NFC writer app elsewhere). Taps through it count apart from QR scans.
 */
export default async function CodeNfcPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const t = await getAppTranslations("app.dashboard.codes.nfc.page");
  const scope = await requireDashboardScope();
  const { workspace, id } = await params;
  const code = await getCode(scope, id).catch((error: unknown) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  const businessCard = await opensBusinessCard(code);
  const link = nfcLink(code.shortLink);
  const codeHref = workspaceHref(
    workspace,
    `/codes/${encodeURIComponent(code.id)}`,
  );
  const pageUrl = new URL(nfcPageHref(workspace, code.id), baseUrl).href;

  return (
    <div className="space-y-6">
      <Button asChild className="-ml-2" size="sm" variant="ghost">
        <Link href={codeHref}>
          <ArrowLeft />
          {t("backToCode")}
        </Link>
      </Button>
      <PageHeader
        description={
          businessCard ? t("writeThisContactPageTo") : t("writeThisCodesLinkTo")
        }
        title={businessCard ? t("putThisCardOnNfc") : t("useWithNfc")}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card className="gap-3 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">{t("nfcLink")}</CardTitle>
              <CardDescription>{t("theCodesShortLinkWith")}</CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <div className="flex items-center gap-1">
                <code className="bg-muted min-w-0 rounded-md px-2 py-1 text-sm break-all">
                  {link}
                </code>
                <CopyButton
                  className="size-8"
                  successMessage={{ title: t("nfcLinkCopied") }}
                  textToCopy={link}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">{t("writeToATag")}</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              <NfcWritePanel nfcUrl={link} pageUrl={pageUrl} />
            </CardContent>
          </Card>
        </div>

        <NfcGuide
          businessCard={businessCard}
          bytes={ndefUrlBytes(link)}
          qrHref={codeHref}
        />
      </div>
    </div>
  );
}
