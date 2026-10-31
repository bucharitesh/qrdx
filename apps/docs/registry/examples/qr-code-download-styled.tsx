import { QRCode } from "qrdx";
import {
  QrCodeDownload,
  type QrCodeStyle,
} from "@/registry/qrdx/qr-code-download";

const value = "https://qrdx.dev/launch";

// The same style object renders the preview and every exported file.
const style: QrCodeStyle = {
  fgColor: {
    type: "linear",
    angle: 135,
    stops: [
      { color: "#7C3AED", offset: 0 },
      { color: "#DB2777", offset: 100 },
    ],
  },
  bodyPattern: "circle",
  cornerEyePattern: "rounded",
};

export default function QrCodeDownloadStyled() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="overflow-hidden rounded-[10px] border">
        <QRCode margin={2} {...style} size={160} value={value} />
      </div>
      <QrCodeDownload
        copy={false}
        filename="launch-qr"
        formats={["png", "svg", "pdf"]}
        label="Export"
        qr={style}
        sizes={[1024, 4096]}
        value={value}
        variant="default"
      />
    </div>
  );
}
