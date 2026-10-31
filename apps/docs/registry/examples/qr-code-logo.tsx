import { QrCode } from "@/registry/qrdx/qr-code";

// A data URL keeps the logo in the PNG and SVG downloads. Remote images
// must be served with CORS headers.
const logo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#155DFC"/><path d="M13 4 6 13.5h5L10 20l7-9.5h-5z" fill="#fff"/></svg>',
)}`;

export default function QrCodeLogo() {
  return (
    <QrCode
      bodyPattern="circle"
      caption="Use level H with a logo"
      cornerEyePattern="rounded"
      level="H"
      logo={logo}
      size={180}
      value="https://qrdx.dev"
    />
  );
}
