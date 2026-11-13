import { WifiQrCode } from "@/registry/qrdx/wifi-qr-code";

export default function WifiQrCodeVariants() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-8">
      <WifiQrCode
        password="espresso-2024"
        qr={{ fgColor: "#0F766E", bodyPattern: "rounded" }}
        showPassword
        size={140}
        ssid="Cafe Guest"
      />
      <WifiQrCode encryption="nopass" size={140} ssid="Library Free WiFi" />
      <WifiQrCode hidden password="s3cret;office" size={140} ssid="Office" />
    </div>
  );
}
