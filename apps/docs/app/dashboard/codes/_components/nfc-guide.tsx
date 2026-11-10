import { Tick } from "@repo/design-system/components/icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
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
  return (
    <Card className="h-fit gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-base">
          {businessCard ? "Make an NFC business card" : "Which tags work"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-5">
        <Section title="What to buy">
          <p>
            {businessCard
              ? "Blank NFC business cards, or NFC stickers to put on a card you have. QRdx doesn't sell or print cards; any NFC supplier does."
              : "Blank NFC tags, stickers, cards or key fobs. QRdx doesn't sell tags; any NFC supplier does."}{" "}
            Look for an NTAG213, NTAG215 or NTAG216 chip.
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="py-1.5 font-normal">Chip</th>
                <th className="py-1.5 font-normal">Memory</th>
                <th className="py-1.5 text-right font-normal">This link</th>
              </tr>
            </thead>
            <tbody>
              {NFC_TAGS.map((tag) => (
                <tr className="border-b last:border-0" key={tag.name}>
                  <td className="text-foreground py-1.5">{tag.name}</td>
                  <td className="py-1.5 tabular-nums">{tag.bytes} bytes</td>
                  <td className="py-1.5 text-right">
                    {tag.bytes >= bytes ? (
                      <span className="text-foreground inline-flex items-center gap-1">
                        <Tick className="size-4" />
                        Fits
                      </span>
                    ) : (
                      "Too small"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs">
            The link needs {bytes} bytes. NTAG215 and NTAG216 leave room if you
            later write a longer link.
          </p>
        </Section>
        <Section title="Write it">
          <p>
            Open this page in Chrome on an Android phone with NFC turned on, tap
            Write to NFC tag and hold the {businessCard ? "card" : "tag"}{" "}
            against the back of the phone. On iPhone, use an NFC writer app.
          </p>
        </Section>
        <Section
          title={
            businessCard ? "Print the QR code on it too" : "Add the QR code"
          }
        >
          <p>
            {businessCard
              ? "The same card can carry the QR code printed on one side: phones without NFC, or with NFC turned off, scan it instead."
              : "Put the QR code next to the tag: phones without NFC, or with NFC turned off, scan it instead."}{" "}
            Analytics counts taps and scans apart.{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href={qrHref}
            >
              Download the QR code
            </Link>
          </p>
        </Section>
        <Section title="Tapping">
          <p>
            Android phones with NFC on and iPhone XS or later open the link when
            the tag touches the phone, with no app. The tag keeps following the
            code: change where it leads in QRdx and every tag you wrote follows.
          </p>
        </Section>
      </CardContent>
    </Card>
  );
}
