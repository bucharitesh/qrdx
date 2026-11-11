import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Airdrop } from "iconsax-reactjs";
import Link from "next/link";
import {
  nfcPageHref,
  opensBusinessCard,
} from "@/app/(app)/dashboard/codes/_lib/nfc";
import type { QrCodeView } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { requestWorkspaceSlug } from "@/lib/scope";

/**
 * "Use with NFC" on a code's Overview tab, for every dynamic code; vCard
 * Plus codes get "Put this card on NFC". Opens the code's NFC page.
 */
export async function NfcCard({
  code,
}: {
  code: Pick<QrCodeView, "id" | "kind" | "pageId">;
}) {
  const t = await getAppTranslations("app.dashboard.codes.nfcCard");
  const [slug, businessCard] = await Promise.all([
    requestWorkspaceSlug(),
    opensBusinessCard(code),
  ]);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">
            {businessCard ? t("nfcBusinessCard") : "NFC"}
          </CardTitle>
          <CardDescription>
            {businessCard ? t("putThisCardOnAn") : t("writeThisCodesLinkTo")}
          </CardDescription>
        </div>
        <Button asChild className="shrink-0" size="sm" variant="outline">
          <Link href={nfcPageHref(slug, code.id)}>
            <Airdrop />
            {businessCard ? t("putThisCardOnNfc") : t("useWithNfc")}
          </Link>
        </Button>
      </CardHeader>
    </Card>
  );
}
