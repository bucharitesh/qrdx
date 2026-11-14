import { QrCode } from "@/registry/qrdx/qr-code";

export function GuestWifi() {
  return (
    <QrCode
      value="WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;"
      label="QR code to join the Cafe Guest Wi-Fi"
      caption="Cafe Guest Wi-Fi"
    />
  );
}
