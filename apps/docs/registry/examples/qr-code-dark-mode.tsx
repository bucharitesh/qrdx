import { QrCode } from "@/registry/qrdx/qr-code";

export default function QrCodeDarkMode() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-8">
      {/* Dark modules on a light tile scan with every reader. */}
      <QrCode
        caption="Light tile"
        downloadFormats={[]}
        size={140}
        value="https://qrdx.dev"
      />
      {/* currentColor follows the text color, so the code inverts in dark mode. */}
      <QrCode
        bgColor="transparent"
        caption="Follows the theme"
        className="text-foreground"
        downloadFormats={[]}
        fgColor="currentColor"
        size={140}
        value="https://qrdx.dev"
      />
    </div>
  );
}
