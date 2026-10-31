import { QRCode } from "qrdx";
import { QrCodeDownload } from "@/registry/qrdx/qr-code-download";

const value = "https://qrdx.dev";

export default function QrCodeDownloadDemo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="overflow-hidden rounded-[10px] border">
        <QRCode margin={2} size={160} value={value} />
      </div>
      <QrCodeDownload value={value} />
    </div>
  );
}
