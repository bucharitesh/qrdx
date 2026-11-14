import { Tick } from "@repo/design-system/components/icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { use } from "react";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { NFC_TAGS } from "@/lib/nfc/links";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="text-muted-foreground space-y-2 text-sm">{children}</div>
    </section>
  );
}

/**
 * What to buy and how to use it, beside the writer. `businessCard`: the code
 * opens a vCard Plus page, so the guide is about NFC business cards.
 */
export function NfcGuide({
  bytes,
  businessCard,
  qrHref,
}: {
  /** Bytes the NFC link takes on a tag (lib/nfc/links.ts ndefUrlBytes) */
  bytes: number;
  businessCard: boolean;
  /** The code's page, where its QR code downloads */
  qrHref: string;
}) {
  const t = use(getAppTranslations("app.dashboard.codes.nfcGuide"));
  return (
    <Card className="h-fit gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-base">
          {businessCard ? t("makeAnNfcBusinessCard") : t("whichTagsWork")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-5">
        <Section title={t("whatToBuy")}>
          <p>
            {businessCard
              ? t("blankNfcBusinessCardsOr")
              : t("blankNfcTagsStickersCards")}{" "}
            {t("lookForAnNtag213Ntag215")}
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="py-1.5 font-normal">{t("chip")}</th>
                <th className="py-1.5 font-normal">{t("memory")}</th>
                <th className="py-1.5 text-right font-normal">
                  {t("thisLink")}
                </th>
              </tr>
            </thead>
            <tbody>
              {NFC_TAGS.map((tag) => (
                <tr className="border-b last:border-0" key={tag.name}>
                  <td className="text-foreground py-1.5">{tag.name}</td>
                  <td className="py-1.5 tabular-nums">
                    {t("bytesBytes", { bytes: tag.bytes })}
                  </td>
                  <td className="py-1.5 text-right">
                    {tag.bytes >= bytes ? (
                      <span className="text-foreground inline-flex items-center gap-1">
                        <Tick className="size-4" />
                        {t("fits")}
                      </span>
                    ) : (
                      t("tooSmall")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs">{t("theLinkNeedsBytesBytes", { bytes })}</p>
        </Section>
        <Section title={t("writeIt")}>
          <p>{businessCard ? t("writeItCard") : t("writeItTag")}</p>
        </Section>
        <Section
          title={businessCard ? t("printTheQrCodeOn") : t("addTheQrCode")}
        >
          <p>
            {businessCard ? t("theSameCardCanCarry") : t("putTheQrCodeNext")}{" "}
            {t("analyticsCountsTapsAndScans")}{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href={qrHref}
            >
              {t("downloadTheQrCode")}
            </Link>
          </p>
        </Section>
        <Section title={t("tapping")}>
          <p>{t("androidPhonesWithNfcOn")}</p>
        </Section>
      </CardContent>
    </Card>
  );
}
