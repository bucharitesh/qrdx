import { QRCode } from "qrdx";
import { buildVCard } from "@/registry/qrdx/vcard-qr-code";

export default function VCardQrCodePayload() {
  const vcard = buildVCard({
    firstName: "Ada",
    lastName: "Lovelace",
    organization: "Analytical Engines, Ltd.",
    mobile: "+44 7700 900000",
    address: { city: "London", country: "United Kingdom" },
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      {/* The vCard is plain text, so any QR renderer can encode it. */}
      <div className="shrink-0 overflow-hidden rounded-[10px] border">
        <QRCode level="M" margin={2} size={160} value={vcard} />
      </div>
      <pre className="w-full overflow-x-auto rounded-[10px] border bg-muted/50 px-4 py-3 font-mono text-xs">
        {vcard}
      </pre>
    </div>
  );
}
