import { QrCodeDownload } from "@/registry/qrdx/qr-code-download";

export function TrackedDownload({ url }: { url: string }) {
  return (
    <QrCodeDownload
      value={url}
      onComplete={(action) => console.log("exported", action)}
      onError={(error) => console.error(error.message)}
    />
  );
}
