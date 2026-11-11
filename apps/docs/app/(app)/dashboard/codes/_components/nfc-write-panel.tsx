"use client";

import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { CodeQr } from "./code-qr";
import { NfcWriter, useWebNfcSupport } from "./nfc-writer";

const IPHONE_STEPS = [
  "Install an NFC writer app from the App Store (search for “NFC writer”).",
  "Copy the NFC link above.",
  "In the app, add a URL record (some apps call it Link or URI) and paste the link.",
  "Choose Write, then hold the top of the iPhone against the tag until the app says it's done.",
];

/**
 * The "Write to a tag" card's body: the Web NFC writer where the browser has
 * it (Chrome on Android), otherwise a QR code that opens this page on an
 * Android phone and steps for an NFC writer app on iPhone.
 */
export function NfcWritePanel({
  nfcUrl,
  pageUrl,
}: {
  /** The code's NFC link, written to the tag */
  nfcUrl: string;
  /** This page's absolute URL, for the "open on Android" QR code */
  pageUrl: string;
}) {
  const { support, canLock } = useWebNfcSupport();

  if (support === "checking") {
    return (
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
      </div>
    );
  }
  if (support === "supported") {
    return <NfcWriter canLock={canLock} url={nfcUrl} />;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">This browser can't write tags</p>
          <p className="text-muted-foreground text-sm">
            Chrome on Android writes tags straight from this page. Scan the code
            with an Android phone that has NFC, sign in, and write the tag
            there.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">On iPhone</p>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm marker:tabular-nums">
            {IPHONE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs">
            Writing needs an iPhone 7 or later on iOS 13 or later.
          </p>
        </div>
      </div>
      <figure className="mx-auto w-40 space-y-2 sm:mx-0">
        <CodeQr
          className="bg-background rounded-lg border p-2"
          style={null}
          value={pageUrl}
        />
        <figcaption className="text-muted-foreground text-center text-xs">
          Open this page on an Android phone
        </figcaption>
      </figure>
    </div>
  );
}
