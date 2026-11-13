import { QRCode } from "qrdx";
import { buildWifiPayload } from "@/registry/qrdx/wifi-qr-code";

export default function WifiQrCodePayload() {
  const payload = buildWifiPayload({
    ssid: "Office; 2nd floor",
    password: 'pa:ss"word',
    encryption: "WPA",
  });

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      {/* The payload is plain text, so any QR renderer can encode it. */}
      <div className="overflow-hidden rounded-[10px] border">
        <QRCode margin={2} size={140} value={payload} />
      </div>
      <pre className="w-full overflow-x-auto rounded-[10px] border bg-muted/50 px-4 py-3 font-mono text-xs">
        {payload}
      </pre>
    </div>
  );
}
